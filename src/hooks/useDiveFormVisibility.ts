"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FieldValues,
  Path,
  PathValue,
  UseFormReturn,
} from "react-hook-form";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import type { DiveMixtureInput } from "@/lib/validations/dive";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  DIVE_FORM_FIELDS,
  EMPTY_DIVE_FORM_VALUES,
  MIXTURE_FORM_FIELDS,
  canonicalHiddenFields,
  isMixtureField,
  mixtureFieldName,
  nonEmptyDiveFormFields,
  type DiveFormFieldKey,
  type DiveFormFieldValues,
} from "@/lib/dive-form-fields";

/** One cylinder as the form holds it, read and written by key rather than by shape. */
type MixtureRow = Record<string, unknown>;

/**
 * How long a burst of switch flips is allowed to settle before it costs a request.
 * Long enough that flipping three switches in a row sends one `PATCH`, short enough
 * that the save has landed by the time a diver could reach another device.
 */
const SAVE_DEBOUNCE_MS = 400;

/** The keys whose effective visibility governs what the cylinder list may hold. */
const GAS_KEYS: readonly DiveFormFieldKey[] = [
  "mixtures",
  ...MIXTURE_FORM_FIELDS,
];

/**
 * Structural equality for the values this layer writes - scalars, uuid arrays and the
 * cylinder list. `JSON.stringify` rather than a deep walk because every one of them is
 * plain JSON already, and the comparison only ever runs on a visibility change.
 */
function sameValue(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (first == null || second == null) return first == null && second == null;
  return JSON.stringify(first) === JSON.stringify(second);
}

export interface DiveFormVisibility {
  /** The stored hidden set, canonical - what a preset is compared against. */
  hidden: readonly DiveFormFieldKey[];
  /** In the stored set, whether or not this instance has revealed it. */
  isHidden: (key: DiveFormFieldKey) => boolean;
  /** Shown on this form only because a value arrived in it - the dialog says so. */
  isRevealed: (key: DiveFormFieldKey) => boolean;
  /** Effective visibility: not hidden, or hidden and revealed. */
  isVisible: (key: DiveFormFieldKey) => boolean;
  /**
   * Replaces the stored hidden set: a switch in the Configure dialog, or a preset
   * applied from the Fields menu. Applies to the form at once, persists debounced, and
   * drops every newly hidden key from the revealed set - those surfaces edit what the
   * diver sees.
   */
  setHidden: (next: readonly DiveFormFieldKey[]) => void;
  /**
   * Puts keys on screen for this form instance without touching the stored set, and
   * marks them as the diver's own so a later hide keeps their values.
   */
  reveal: (keys: readonly DiveFormFieldKey[]) => void;
  /** `reveal` for the keys these values hold something in - the shape all four moments take. */
  revealNonEmpty: (values: DiveFormFieldValues) => void;
  /**
   * Applies the new form's prefill through the visibility rules.
   *
   * `base` is the page's own `reset` object and `carried` is what the last dive (or a
   * URL parameter) offers per key; what comes back is `base` with each carried key set
   * to its carried value where the key is visible and to its empty value where it is
   * not. Recording what it wrote is the other half of the call, and it is what makes
   * "untouched" answerable afterwards.
   */
  prefill: <T>(
    base: T,
    carried: Partial<Record<DiveFormFieldKey, unknown>>,
  ) => T;
  /** True while a toggle is in flight. */
  isSaving: boolean;
  /** The API's own wording when a toggle could not be saved, or null. */
  saveError: string | null;
}

export interface UseDiveFormVisibilityOptions<
  TFieldValues extends FieldValues,
> {
  form: UseFormReturn<TFieldValues>;
  /**
   * The `mixtures` field array's `replace`, from the page's single instance - plain
   * `setValue` does not keep `useFieldArray`'s own `fields` in step (DECISIONS.md,
   * "Parsed dive-file mixtures need `useFieldArray().replace()`").
   */
  replaceMixtures: (mixtures: DiveMixtureInput[]) => void;
  /**
   * Whether showing and hiding a key writes a value into it.
   *
   * True on the new form, where a field carries the last dive's value; false on the
   * edit form, which has no defaults - there, what appears on show is the stored value
   * and hide/show never change form state.
   */
  fillsDefaults: boolean;
}

/**
 * Owns, for one dive form: which fields are hidden, which this instance has revealed,
 * and - on the new form - what a show or a hide does to the value underneath.
 *
 * **The stored set comes from `useAuth().user`**, so it is present at first render and
 * the first paint already omits the hidden fields rather than painting them and taking
 * them away. A toggle applies immediately and is persisted debounced through
 * `PATCH /user`, then folded into the auth context with `mergeUser` - never with
 * `refreshUser`, which is a round trip this caller does not need.
 *
 * **"Untouched" is this layer's own record, never react-hook-form's dirty state.**
 * The layer remembers the last value it wrote for each key; a key still holding that
 * value is untouched, anything else is the diver's. This is the rule
 * `CertificationDialog` keeps as `autofilledRef`, for the reason DECISIONS.md records
 * under "A silently prefilled field is not a clean field": `dirtyFields` is recomputed
 * for the whole form whenever any field is edited back to its default, and
 * `useFieldArray().replace()` - the only write for `mixtures` - writes `_formValues`
 * and not `_defaultValues`, so a show-fill of the gas card reads as dirty though
 * nobody typed. A value that arrived from outside the diver's typing is *not* the
 * layer's write: `reveal` marks those keys as the diver's, so hiding the field keeps
 * what an import, a gear set or a URL parameter put there.
 */
export function useDiveFormVisibility<TFieldValues extends FieldValues>({
  form,
  replaceMixtures,
  fillsDefaults,
}: UseDiveFormVisibilityOptions<TFieldValues>): DiveFormVisibility {
  const { user, mergeUser } = useAuth();
  const { toast } = useToast();

  const stored = useMemo(
    () => canonicalHiddenFields(user?.dive_form_hidden_fields ?? []),
    [user?.dive_form_hidden_fields],
  );

  // `null` until this form changes something, so the account's set stays the source of
  // truth up to that point - including when it arrives a render after mount, which is
  // what a hard reload does.
  const [override, setOverride] = useState<DiveFormFieldKey[] | null>(null);
  const [revealed, setRevealed] = useState<ReadonlySet<DiveFormFieldKey>>(
    () => new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hidden = override ?? stored;

  // Mirrors of the two, readable from a handler without a stale closure. Written both
  // here (so the account's set arriving after mount is picked up) and synchronously
  // inside `setHidden`/`reveal`, so two toggles in one tick still compose.
  const hiddenRef = useRef<readonly DiveFormFieldKey[]>(hidden);
  const revealedRef = useRef<ReadonlySet<DiveFormFieldKey>>(revealed);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  // What the prefill offers per key, and what this layer last wrote there. Refs rather
  // than state: nothing renders from them, and they must be readable synchronously
  // inside the write that consults them.
  const carriedRef = useRef<Partial<Record<DiveFormFieldKey, unknown>>>({});
  const writtenRef = useRef<Partial<Record<DiveFormFieldKey, unknown>>>({});
  const touchedRef = useRef<Set<DiveFormFieldKey>>(new Set());

  // Read through refs so the callbacks below stay stable: they are dependencies of the
  // pages' own effects, and a fresh identity per render would re-run those - which for
  // the prefill means refetching the last dive and re-stamping the start time.
  //
  // Synced in an effect rather than during render, which the `react-hooks/refs` rule
  // requires and which costs nothing here: each ref is seeded with the value it is
  // being given, and every reader is an event handler or a later effect.
  const formRef = useRef(form);
  const replaceMixturesRef = useRef(replaceMixtures);
  const fillsDefaultsRef = useRef(fillsDefaults);
  const mergeUserRef = useRef(mergeUser);
  const toastRef = useRef(toast);
  useEffect(() => {
    formRef.current = form;
    replaceMixturesRef.current = replaceMixtures;
    fillsDefaultsRef.current = fillsDefaults;
    mergeUserRef.current = mergeUser;
    toastRef.current = toast;
  });

  const readValue = useCallback((key: DiveFormFieldKey): unknown => {
    return formRef.current.getValues(key as unknown as Path<TFieldValues>);
  }, []);

  const readMixtures = useCallback((): MixtureRow[] => {
    const rows = formRef.current.getValues(
      "mixtures" as unknown as Path<TFieldValues>,
    ) as unknown as MixtureRow[] | undefined;
    return rows ?? [];
  }, []);

  // Seeds the "last written" record from whatever the form opens with, so a key the
  // diver typed into before the prefill resolved still reads as theirs. Without it an
  // unwritten key would compare against `undefined` and every hide would be free to
  // empty it.
  useEffect(() => {
    const initial: Partial<Record<DiveFormFieldKey, unknown>> = {};
    for (const key of DIVE_FORM_FIELDS) {
      if (isMixtureField(key)) continue;
      initial[key] = formRef.current.getValues(
        key as unknown as Path<TFieldValues>,
      );
    }
    initial.mixtures = readMixtures();
    writtenRef.current = initial;
    // Mount only: this is the form's starting point, and re-reading it later would
    // adopt the diver's own entries as the layer's writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- persistence -------------------------------------------------------

  const pendingRef = useRef<DiveFormFieldKey[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const flush = useCallback(async () => {
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isMountedRef.current) {
      setIsSaving(true);
      setSaveError(null);
    }
    try {
      // `PATCH /user` is `extra="forbid"`, so only the field being changed is sent -
      // the same shape the settings cards use.
      await authAPI.updateProfile({ dive_form_hidden_fields: next });
      mergeUserRef.current({ dive_form_hidden_fields: next });
    } catch (error) {
      console.error("Failed to save dive form field visibility:", error);
      const message = getApiErrorMessage(
        error,
        "Couldn't save which fields to show. This form still looks the way you set it.",
      );
      // A toast, not only the `saveError` an open surface can render. Two of the three
      // ways to reach this leave nothing on screen to render it into: applying a preset
      // closes the Fields menu, and a switch flipped in Configure can be followed by
      // closing the dialog before the debounce fires. The failure would then surface
      // whenever Configure was next opened, reading as an error about whatever the diver
      // was doing *then*. It is also the only report that fires per failure rather than
      // per change of message: `setSaveError` with an identical string re-renders
      // nothing, so a second failure with the same wording would say nothing at all.
      toastRef.current({
        variant: "destructive",
        title: "Fields not saved",
        description: message,
      });
      if (isMountedRef.current) setSaveError(message);
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, []);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // A diver who ticks a box and leaves immediately still saved it: the request
      // outlives the component, and the merge into the context is a no-op by then.
      if (timerRef.current) clearTimeout(timerRef.current);
      void flushRef.current();
    };
  }, []);

  // ---- the value rules ---------------------------------------------------

  const isUntouched = useCallback(
    (key: DiveFormFieldKey): boolean => {
      if (touchedRef.current.has(key)) return false;
      return sameValue(readValue(key), writtenRef.current[key]);
    },
    [readValue],
  );

  /** The cylinder list as the carried values project through a given visibility. */
  const desiredMixtures = useCallback(
    (visible: (key: DiveFormFieldKey) => boolean): MixtureRow[] => {
      if (!visible("mixtures")) return [];
      const carried = (carriedRef.current.mixtures as MixtureRow[]) ?? [];
      return carried.map((row) => {
        const next: MixtureRow = { ...row };
        for (const key of MIXTURE_FORM_FIELDS) {
          if (!visible(key))
            next[mixtureFieldName(key)] = EMPTY_DIVE_FORM_VALUES[key];
        }
        return next;
      });
    },
    [],
  );

  /**
   * Applies the show/hide rules to every key whose effective visibility just changed.
   *
   * The cylinder list is governed as one value, which is what §"For `mixtures` the
   * value is the whole cylinder list" means in practice: a diver who has typed into
   * any tank keeps every column of it, hidden or not. Per-cell bookkeeping would let a
   * hide empty a column in the tank next to the one they were editing, which is a
   * worse answer to the same rule.
   */
  const applyValueRules = useCallback(
    (
      wasVisible: (key: DiveFormFieldKey) => boolean,
      isNowVisible: (key: DiveFormFieldKey) => boolean,
    ) => {
      if (!fillsDefaultsRef.current) return;

      for (const key of DIVE_FORM_FIELDS) {
        if (GAS_KEYS.includes(key)) continue;
        if (wasVisible(key) === isNowVisible(key)) continue;
        if (!isUntouched(key)) continue;

        const target = isNowVisible(key)
          ? (carriedRef.current[key] ?? EMPTY_DIVE_FORM_VALUES[key])
          : EMPTY_DIVE_FORM_VALUES[key];
        if (sameValue(readValue(key), target)) continue;

        formRef.current.setValue(
          key as unknown as Path<TFieldValues>,
          target as PathValue<TFieldValues, Path<TFieldValues>>,
          { shouldValidate: true, shouldDirty: true },
        );
        writtenRef.current[key] = target;
      }

      const gasChanged = GAS_KEYS.some(
        (key) => wasVisible(key) !== isNowVisible(key),
      );
      if (!gasChanged) return;
      if (GAS_KEYS.some((key) => touchedRef.current.has(key))) return;

      const current = readMixtures();
      if (!sameValue(current, writtenRef.current.mixtures ?? [])) return;

      const desired = desiredMixtures(isNowVisible);
      if (sameValue(current, desired)) return;

      // `desiredMixtures` builds rows by key rather than by shape - it has to, since a
      // per-cylinder column is named by a `mixture.` key - so the cast is where that
      // loose typing is handed back to the field array.
      replaceMixturesRef.current(desired as unknown as DiveMixtureInput[]);
      writtenRef.current.mixtures = desired;
    },
    [desiredMixtures, isUntouched, readMixtures, readValue],
  );

  // ---- the surface -------------------------------------------------------

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  const isHidden = useCallback(
    (key: DiveFormFieldKey) => hiddenSet.has(key),
    [hiddenSet],
  );
  const isRevealed = useCallback(
    (key: DiveFormFieldKey) => revealed.has(key),
    [revealed],
  );
  const isVisible = useCallback(
    (key: DiveFormFieldKey) => !hiddenSet.has(key) || revealed.has(key),
    [hiddenSet, revealed],
  );

  const setHidden = useCallback(
    (next: readonly DiveFormFieldKey[]) => {
      const canonical = canonicalHiddenFields(next);
      const previousHidden = new Set(hiddenRef.current);
      const previousRevealed = revealedRef.current;
      const nextHiddenSet = new Set(canonical);

      // Turning a switch off means "off my form", so it also takes the key out of the
      // revealed set - otherwise a field revealed by an edit load could not be put
      // away again from the dialog that offered the switch.
      const nextRevealed = new Set(
        [...previousRevealed].filter((key) => !nextHiddenSet.has(key)),
      );

      const wasVisible = (key: DiveFormFieldKey) =>
        !previousHidden.has(key) || previousRevealed.has(key);
      const isNowVisible = (key: DiveFormFieldKey) =>
        !nextHiddenSet.has(key) || nextRevealed.has(key);

      hiddenRef.current = canonical;
      revealedRef.current = nextRevealed;
      setOverride(canonical);
      setRevealed(nextRevealed);

      applyValueRules(wasVisible, isNowVisible);

      pendingRef.current = canonical;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => void flushRef.current(),
        SAVE_DEBOUNCE_MS,
      );
    },
    [applyValueRules],
  );

  const reveal = useCallback((keys: readonly DiveFormFieldKey[]) => {
    if (keys.length === 0) return;
    // Marked before anything else: a value that arrived from an import, a gear set,
    // an edit load or a URL parameter is the diver's, so a later hide keeps it.
    for (const key of keys) touchedRef.current.add(key);

    const next = new Set(revealedRef.current);
    let changed = false;
    for (const key of keys) {
      if (!next.has(key)) {
        next.add(key);
        changed = true;
      }
    }
    if (!changed) return;
    revealedRef.current = next;
    setRevealed(next);
  }, []);

  const revealNonEmpty = useCallback(
    (values: DiveFormFieldValues) => reveal(nonEmptyDiveFormFields(values)),
    [reveal],
  );

  const prefill = useCallback(
    <T>(base: T, carried: Partial<Record<DiveFormFieldKey, unknown>>): T => {
      carriedRef.current = { ...carried };

      const hiddenNow = new Set(hiddenRef.current);
      const visible = (key: DiveFormFieldKey) =>
        !hiddenNow.has(key) || revealedRef.current.has(key);

      const seeded: Record<string, unknown> = {
        ...(base as Record<string, unknown>),
      };
      for (const key of Object.keys(carried) as DiveFormFieldKey[]) {
        if (key === "mixtures" || isMixtureField(key)) continue;
        seeded[key] = visible(key) ? carried[key] : EMPTY_DIVE_FORM_VALUES[key];
      }
      if ("mixtures" in carried) seeded.mixtures = desiredMixtures(visible);

      // Every key, not only the carried ones: what the form ends up holding *is* this
      // layer's write, and a key left out of the record would read as the diver's the
      // first time they hid it.
      const written: Partial<Record<DiveFormFieldKey, unknown>> = {};
      for (const key of DIVE_FORM_FIELDS) {
        if (isMixtureField(key)) continue;
        written[key] = seeded[key];
      }
      writtenRef.current = written;

      return seeded as T;
    },
    [desiredMixtures],
  );

  return {
    hidden,
    isHidden,
    isRevealed,
    isVisible,
    setHidden,
    reveal,
    revealNonEmpty,
    prefill,
    isSaving,
    saveError,
  };
}
