"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Email preferences. Currently just the gear-service reminder, which is opt-*out*: a
// reminder nobody switched on is a reminder that never arrives, and the point of it is
// reaching a diver who isn't currently in the app.
//
// Saves on change rather than behind a "Save" button - it's a single boolean, and a
// toggle that needs confirming reads as broken.
export function NotificationsCard() {
  const { user, refreshUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defaults to on when the API predates the field, matching the server-side default.
  const enabled = user?.gear_service_emails ?? true;

  const handleChange = async (next: boolean) => {
    setError(null);
    try {
      setIsSaving(true);
      // `PATCH /user` is `extra="forbid"`, so only the field being changed is sent.
      await authAPI.updateProfile({ gear_service_emails: next });
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
        <CardTitle className="flex items-center">
          <Bell className="h-5 w-5 mr-2" />
          Notifications
        </CardTitle>
        <CardDescription>Choose what we email you about.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <Checkbox
            id="gear-service-emails"
            className="mt-1"
            checked={enabled}
            disabled={isSaving}
            onChange={(e) => handleChange(e.target.checked)}
          />
          <div>
            <Label
              htmlFor="gear-service-emails"
              className="cursor-pointer font-normal"
            >
              Remind me when gear is due for service
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              A single email listing anything coming due — regulator services,
              cylinder inspections and tests, computer batteries. One when
              something is approaching, one when it&apos;s overdue.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}
