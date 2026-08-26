"use client";

import { useState } from "react";
import { Ruler } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { inputClassName } from "@/components/ui/input";
import { UNIT_SYSTEMS, UNIT_SYSTEM_LABELS, type UnitSystem } from "@/lib/units";

// Which system every measurement in the app is shown and typed in.
//
// Saves on change, like the gear-reminder toggle beside it: one field, and the
// whole app re-renders converted the moment `refreshUser` lands, so a "Save" button
// would sit between the diver and a change they can already see happening.
//
// A plain `<select>` rather than the shadcn `Select`, but for the opposite reason to
// the dive form's pickers: those need `""` as a selectable "unset", and this one has
// no empty state at all - the column is `NOT NULL` and every account has an answer.
// A native two-option picker is simply the smallest thing that works here.
export function UnitsCard() {
  const { user, refreshUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const units = user?.units ?? "metric";

  const handleChange = async (next: UnitSystem) => {
    setError(null);
    try {
      setIsSaving(true);
      // `PATCH /user` is `extra="forbid"`, so only the field being changed is sent.
      await authAPI.updateProfile({ units: next });
      await refreshUser();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Ruler className="h-5 w-5" />
          Units
        </CardTitle>
        <CardDescription>
          How depths, temperatures and pressures are shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="units">Measurement system</Label>
          <select
            id="units"
            className={inputClassName}
            value={units}
            disabled={isSaving}
            onChange={(e) => handleChange(e.target.value as UnitSystem)}
          >
            {UNIT_SYSTEMS.map((system) => (
              <option key={system} value={system}>
                {UNIT_SYSTEM_LABELS[system]}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Applies everywhere at once, on every device you sign in from. Your
            dives are stored in metric whichever you pick, and the data export
            is metric too — so switching changes what you read, never what is
            recorded.
          </p>
          <p className="text-sm text-muted-foreground">
            While logging a dive you can switch individual fields — depth,
            pressure, weight and the rest — without changing this. Those choices
            are remembered on this device only, and affect what you type in, not
            what you read back.
          </p>
        </div>

        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}
