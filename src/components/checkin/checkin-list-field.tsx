"use client";

import { useCallback, useEffect, useId, useRef } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import type { FormControlSlotProps } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  AddRowButton,
  RepeatableRow,
  RepeatableRowField,
} from "@/components/ui/repeatable-row";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import {
  MAX_EMERGENCY_CONTACTS,
  MAX_INSURANCE_POLICIES,
} from "@/lib/api/checkin-details";
import { cn } from "@/lib/utils";
import {
  emptyEmergencyContact,
  emptyInsurancePolicy,
  type EmergencyContactFormValue,
  type InsurancePolicyFormValue,
} from "@/lib/validations/checkin-details";

/** What the schema said about a list: the cap, or each row's members by name. */
export interface ListFieldErrors {
  list?: string;
  rows?: (Partial<Record<string, string>> | undefined)[];
}

/**
 * React Hook Form's error for a list member, taken apart into something renderable:
 * a failing row makes the error an array whose own `message` is `undefined`, which a
 * single `FormMessage` would print as the word, so the field shows each row's itself.
 */
export function listFieldErrors(error: unknown): ListFieldErrors {
  if (Array.isArray(error)) {
    return {
      rows: error.map((row) =>
        row && typeof row === "object"
          ? Object.fromEntries(
              Object.entries(row).flatMap(([member, value]) => {
                const message = (value as { message?: unknown } | undefined)
                  ?.message;
                return typeof message === "string" ? [[member, message]] : [];
              }),
            )
          : undefined,
      ),
    };
  }
  const message = (error as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? { list: message } : {};
}

interface RowFieldSpec<T> {
  member: keyof T & string;
  label: string;
  kind: "text" | "tel" | "date";
  placeholder?: string;
}

interface ListShape<T> {
  /** The row's own word, lower case: "contact", "policy". */
  noun: string;
  /** The first field names the row, and is the one the API requires. */
  fields: RowFieldSpec<T>[];
  cap: number;
  empty: () => T;
  addLabel: string;
  emptyText: string;
  fullText: string;
}

export interface ListFieldProps<T> extends FormControlSlotProps {
  value: T[];
  onChange: (rows: T[]) => void;
  errors?: ListFieldErrors;
  disabled?: boolean;
}

/**
 * An ordered list of check-in rows - the trip parts' shape: a drag handle once there
 * are two, Remove named by the row, the cap felt at the Add button, focus moving to
 * the row just added. Controlled, so a form wires it through a `FormField`.
 */
function CheckinListField<T extends Record<string, string>>({
  value,
  onChange,
  errors,
  disabled,
  shape,
  // Forwarded to the Add button, the one control that exists whatever the list
  // holds, so `FormLabel`'s `htmlFor` lands on something real.
  ...slotProps
}: ListFieldProps<T> & { shape: ListShape<T> }) {
  const { noun, fields, cap, empty } = shape;
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  // Set by the Add button, so opening a form that already has rows grabs no focus.
  const focusNewRowRef = useRef(false);

  // Also covers the add that reaches the cap: the button disables, a browser blurs
  // what it disables, and focus would otherwise land on `<body>`.
  useEffect(() => {
    if (!focusNewRowRef.current) return;
    focusNewRowRef.current = false;
    rowRefs.current[value.length - 1]
      ?.querySelector<HTMLInputElement>("input")
      ?.focus();
  }, [value.length]);

  const isFull = value.length >= cap;

  const add = () => {
    if (isFull) return;
    focusNewRowRef.current = true;
    onChange([...value, empty()]);
  };

  // By position: two identical rows are legal, and removing by content would take both.
  const remove = (index: number) =>
    onChange(value.filter((_, position) => position !== index));

  const update = (index: number, member: keyof T & string, next: string) =>
    onChange(
      value.map((row, position) =>
        position === index ? { ...row, [member]: next } : row,
      ),
    );

  const reorder = useCallback(
    (from: number, to: number) => onChange(moveItem(value, from, to)),
    [value, onChange],
  );

  const { draggingIndex, dragOffset, setItemRef, handleProps } = useDragSort({
    itemCount: value.length,
    onReorder: reorder,
    disabled,
  });

  const anchor = fields[0].member;
  const title = `${noun[0].toUpperCase()}${noun.slice(1)}`;

  return (
    <div className="space-y-4">
      {value.length > 0 ? (
        <ul
          className={cn("space-y-4", draggingIndex !== null && "select-none")}
        >
          {value.map((row, index) => {
            const name = row[anchor].trim() || `${noun} ${index + 1}`;
            const labelSuffix = `${noun} ${index + 1} of ${value.length}`;
            const isDragging = draggingIndex === index;
            return (
              <RepeatableRow
                // The position, as removal uses it: identical rows are legal, and
                // the rows hold no state of their own for a reuse to reset.
                key={index}
                as="li"
                ref={(el) => {
                  setItemRef(index)(el);
                  rowRefs.current[index] = el;
                }}
                title={`${title} ${index + 1}`}
                removeLabel={`Remove ${name}`}
                onRemove={() => remove(index)}
                dragHandle={
                  value.length > 1
                    ? {
                        label: `Reorder ${name}, position ${index + 1} of ${value.length}. Use arrow up and arrow down to move it.`,
                        props: handleProps(index),
                      }
                    : undefined
                }
                disabled={disabled}
                className={cn(
                  isDragging &&
                    "relative z-10 bg-background shadow-lg ring-2 ring-ring",
                )}
                style={
                  isDragging
                    ? { transform: `translateY(${dragOffset}px)` }
                    : undefined
                }
              >
                {fields.map((spec) => (
                  <ListRowField
                    key={spec.member}
                    spec={spec}
                    value={row[spec.member]}
                    labelSuffix={labelSuffix}
                    error={errors?.rows?.[index]?.[spec.member]}
                    disabled={disabled}
                    onChange={(next) => update(index, spec.member, next)}
                  />
                ))}
              </RepeatableRow>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{shape.emptyText}</p>
      )}

      <AddRowButton
        {...slotProps}
        aria-label={shape.addLabel}
        disabled={disabled || isFull}
        onClick={add}
      >
        {shape.addLabel}
      </AddRowButton>

      {isFull && (
        <p className="text-xs text-muted-foreground">{shape.fullText}</p>
      )}

      {/* The cap as the schema sees it: unreachable while the Add button is the only
          thing that grows the list, and rendered anyway, since a save refused with
          nothing on screen is the failure this path exists to avoid. */}
      {errors?.list && (
        <p className="text-sm font-medium text-destructive">{errors.list}</p>
      )}
    </div>
  );
}

function ListRowField<T>({
  spec,
  value,
  labelSuffix,
  error,
  disabled,
  onChange,
}: {
  spec: RowFieldSpec<T>;
  value: string;
  labelSuffix: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const described = {
    "aria-describedby": error ? errorId : undefined,
    "aria-invalid": !!error,
  };

  return (
    <RepeatableRowField id={id} label={spec.label} labelSuffix={labelSuffix}>
      {spec.kind === "date" ? (
        <DatePicker
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...described}
        />
      ) : (
        <Input
          id={id}
          type={spec.kind}
          placeholder={spec.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          {...described}
        />
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </RepeatableRowField>
  );
}

const CONTACTS: ListShape<EmergencyContactFormValue> = {
  noun: "contact",
  fields: [
    { member: "name", label: "Name", kind: "text" },
    { member: "phone", label: "Phone number", kind: "tel" },
    {
      member: "relationship",
      label: "Relationship to you",
      kind: "text",
      placeholder: "Partner, parent, friend…",
    },
  ],
  cap: MAX_EMERGENCY_CONTACTS,
  empty: emptyEmergencyContact,
  addLabel: "Add a contact",
  emptyText: "No emergency contacts yet.",
  fullText: `${MAX_EMERGENCY_CONTACTS} contacts at most - remove one to add another.`,
};

const POLICIES: ListShape<InsurancePolicyFormValue> = {
  noun: "policy",
  fields: [
    {
      member: "provider",
      label: "Provider",
      kind: "text",
      placeholder: "DAN Europe, DiveAssure…",
    },
    { member: "number", label: "Policy number", kind: "text" },
    { member: "expires_on", label: "Expires on", kind: "date" },
  ],
  cap: MAX_INSURANCE_POLICIES,
  empty: emptyInsurancePolicy,
  addLabel: "Add a policy",
  emptyText: "No insurance policies yet.",
  fullText: `${MAX_INSURANCE_POLICIES} policies at most - remove one to add another.`,
};

/** The diver's emergency contacts, in the order a shop calls them. */
export function EmergencyContactsField(
  props: ListFieldProps<EmergencyContactFormValue>,
) {
  return <CheckinListField {...props} shape={CONTACTS} />;
}

/** The diver's insurance policies, in the order they keep them. */
export function InsurancePoliciesField(
  props: ListFieldProps<InsurancePolicyFormValue>,
) {
  return <CheckinListField {...props} shape={POLICIES} />;
}
