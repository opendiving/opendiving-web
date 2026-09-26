"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authAPI, type UpdateProfileData } from "@/lib/api/auth";
import { CERTIFICATION_EXPIRING_SOON_DAYS } from "@/lib/certification";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormApiError } from "@/components/ui/form-api-error";

// The scheduled emails, one switch each. All three are opt-*out*: a reminder nobody
// switched on is a reminder that never arrives, and the point of each is reaching a
// diver who isn't currently in the app.
//
// Saves on change rather than behind a "Save" button - each row is a single boolean,
// and a toggle that needs confirming reads as broken.
type EmailPreference =
  "gear_service_emails" | "renewal_reminder_emails" | "year_in_review_emails";

interface EmailPreferenceRow {
  key: EmailPreference;
  id: string;
  label: string;
  description: string;
}

const ROWS: EmailPreferenceRow[] = [
  {
    key: "gear_service_emails",
    id: "gear-service-emails",
    label: "Remind me when gear is due for service",
    description:
      "A single email listing anything coming due — regulator services, cylinder inspections and tests, computer batteries. One when something is approaching, one when it's overdue.",
  },
  {
    key: "renewal_reminder_emails",
    id: "renewal-reminder-emails",
    label: "Remind me when a certification or my insurance is expiring",
    description: `A single email listing every card, and your dive insurance, within ${CERTIFICATION_EXPIRING_SOON_DAYS} days of its expiry date. One as it enters that window, one when it expires.`,
  },
  {
    key: "year_in_review_emails",
    id: "year-in-review-emails",
    label: "Send me my year in review",
    description:
      "Each January, last year's diving in figures — dives and time underwater, the deepest and longest, sites and species. Never for a year with no dives.",
  },
];

export function NotificationsCard() {
  const { user, refreshUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (key: EmailPreference, next: boolean) => {
    setError(null);
    try {
      setIsSaving(true);
      // `PATCH /user` is `extra="forbid"`, so only the field being changed is sent.
      const body: UpdateProfileData = {};
      body[key] = next;
      await authAPI.updateProfile(body);
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
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>Choose what we email you about.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {ROWS.map(({ key, id, label, description }) => (
            <div key={key} className="flex items-start gap-3">
              <Switch
                id={id}
                // On when the API predates the field, matching the server default.
                checked={user?.[key] ?? true}
                disabled={isSaving}
                onCheckedChange={(next) => handleChange(key, next)}
              />
              <div>
                <Label htmlFor={id} className="cursor-pointer font-normal">
                  {label}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <FormApiError error={error} className="mt-3" />
      </CardContent>
    </Card>
  );
}
