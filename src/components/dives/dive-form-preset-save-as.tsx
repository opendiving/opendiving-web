"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dialogFormSubmit } from "@/lib/dialog-form";
import type { DiveFormPreset } from "@/lib/api/dive-form-presets";

/**
 * The API compares preset names case-insensitively - a create under a name already
 * taken is a 422 - so this has to match the same way, or "recreational" would take
 * the create branch and come back rejected.
 */
function findByName(presets: readonly DiveFormPreset[], name: string) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  return presets.find((preset) => preset.name.toLowerCase() === wanted);
}

interface DiveFormPresetSaveAsProps {
  presets: readonly DiveFormPreset[];
  disabled: boolean;
  /** Save. The name is trimmed and matched already; `existing` is what it named. */
  onSave: (name: string, existing: DiveFormPreset | undefined) => void;
}

/**
 * "Save as" at the foot of the Fields tab: a name with the account's presets on a
 * dropdown, and one button that either writes a new preset or replaces an existing
 * one's fields.
 *
 * **One control for what used to be two.** A "Save current fields as a preset" button
 * and an "Update with current fields" button per row are the same act under two names,
 * and the second scaled with the list. Typing a name that matches nothing creates;
 * typing or picking one that matches replaces - which is why the line under the field
 * says which of the two the button is about to do, rather than leaving an overwrite to
 * be discovered.
 *
 * **Written out rather than reaching for `CreatableCombobox`.** That component commits
 * on blur - unmatched text with no `onCreate` resolves to "clear", and the effect that
 * syncs text from the selected id then empties the field - so typing a new name and
 * *clicking* anything would wipe it before the click landed. The field here holds what
 * was typed until the button is pressed, which is the whole contract.
 */
export function DiveFormPresetSaveAs({
  presets,
  disabled,
  onSave,
}: DiveFormPresetSaveAsProps) {
  const [name, setName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();

  const trimmed = name.trim();
  const existing = findByName(presets, trimmed);
  const matches = presets.filter((preset) =>
    preset.name.toLowerCase().includes(trimmed.toLowerCase()),
  );

  const close = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const pick = (preset: DiveFormPreset) => {
    setName(preset.name);
    close();
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) return delta === 1 ? 0 : matches.length - 1;
        return Math.min(matches.length - 1, Math.max(0, current + delta));
      });
      return;
    }
    // Enter takes the highlighted row when there is one, and otherwise falls
    // through to the form's own submit - which is the Save button.
    if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      pick(matches[activeIndex]);
    }
  };

  return (
    // A `<form>` so Enter saves, and `dialogFormSubmit` so that submit stops here
    // rather than reaching the dive form's own `onSubmit` through the React tree -
    // see "A dialog's submit event bubbles into the form that opened it" in
    // DECISIONS.md.
    <form
      className="space-y-1 border-t pt-4"
      onSubmit={dialogFormSubmit((event) => {
        event?.preventDefault();
        if (!trimmed) return;
        onSave(trimmed, existing);
      })}
    >
      <Label htmlFor={inputId}>Save as</Label>
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Input
            id={inputId}
            ref={inputRef}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={name}
            maxLength={255}
            placeholder="New preset name, or an existing one"
            disabled={disabled}
            onChange={(event) => {
              setName(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setIsOpen(true)}
            // Closing on blur has to outlast the mousedown that picked a row, so
            // the rows commit on `mousedown` and this runs after them.
            onBlur={close}
            onKeyDown={handleKeyDown}
            className="pr-9"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            disabled={disabled}
            onMouseDown={(event) => {
              // Before the input's blur, so the toggle really toggles instead of
              // reopening what the blur has just closed.
              event.preventDefault();
              setIsOpen((open) => !open);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {isOpen && matches.length > 0 && (
            // Opens *upward*. This row is the last thing in a dialog that scrolls
            // its own content, so a list dropping below the input is clipped by the
            // dialog's `overflow-y-auto` rather than floating over it - measured at
            // 65px cut off with three presets. Nothing here can outgrow that: the
            // control only ever sits at the foot of the Fields tab.
            <ul
              id={listId}
              role="listbox"
              className="absolute bottom-full z-50 mb-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
            >
              {matches.map((preset, index) => (
                <li key={preset.uuid}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(preset);
                    }}
                    className={`w-full rounded-sm px-2 py-1.5 text-left text-sm ${
                      index === activeIndex ? "bg-accent" : ""
                    }`}
                  >
                    {preset.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" disabled={disabled || trimmed.length === 0}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {trimmed.length === 0
          ? "Keep the fields above under a name you can come back to."
          : existing
            ? `Replaces the fields saved in "${existing.name}".`
            : `Creates a new preset called "${trimmed}".`}
      </p>
    </form>
  );
}
