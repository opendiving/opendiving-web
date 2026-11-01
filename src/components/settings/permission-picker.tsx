"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { groupPermissions } from "@/lib/permissions";

interface PermissionPickerProps {
  legend?: string;
  scopes: string[];
  selected: string[];
  disabled: boolean;
  onChange: (selected: string[]) => void;
}

export function PermissionPicker({
  legend = "Requested permissions",
  scopes,
  selected,
  disabled,
  onChange,
}: PermissionPickerProps) {
  const groups = groupPermissions(scopes);

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="text-base font-semibold">{legend}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selected.length} of {scopes.length} selected
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange(scopes.filter((scope) => scope.endsWith(":read")))
            }
          >
            Read only
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...scopes])}
          >
            Select all
          </Button>
        </div>
      </div>
      <ScrollArea
        role="region"
        aria-label="Permissions by content"
        className="rounded-lg border"
        viewportClassName="max-h-[42vh] overscroll-contain"
      >
        <div className="divide-y">
          {groups.map((group) => (
            <div
              key={group.resource}
              role="group"
              aria-label={group.label}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center"
            >
              <p className="text-sm font-medium">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.permissions.map((permission) => (
                  <label
                    key={permission.scope}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm text-muted-foreground has-checked:border-teal/40 has-checked:bg-teal/5 has-checked:text-foreground touch:min-h-11"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(permission.scope)}
                      aria-label={`${permission.label} ${group.label.toLowerCase()}`}
                      className="h-4 w-4 shrink-0 accent-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selected, permission.scope]
                            : selected.filter(
                                (scope) => scope !== permission.scope,
                              ),
                        )
                      }
                    />
                    {permission.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Create &amp; edit allows changes to your content. Delete allows
        permanent removal. Share allows creating links others can use to view
        your check-in.
      </p>
    </fieldset>
  );
}
