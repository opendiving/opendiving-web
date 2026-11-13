"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { StatusMessage } from "@/components/ui/status-message";
import { useOptionalList } from "@/hooks/useOptionalList";
import {
  apiKeysAPI,
  type ApiKeyCreated,
  type ApiKeyLifetime,
} from "@/lib/api/api-keys";
import { getApiErrorMessage } from "@/lib/api/error";
import { PASSKEY_NAME_MAX_LENGTH } from "@/lib/passkey-name";
import { PermissionPicker } from "./permission-picker";

const loadPermissions = () => apiKeysAPI.getPermissions();

// The API bounds a key's name with the passkey's own constant.
const NAME_MAX_LENGTH = PASSKEY_NAME_MAX_LENGTH;

const LIFETIME_LABELS: Record<ApiKeyLifetime, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  never: "Never",
};

const apiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the key a name.")
    .max(NAME_MAX_LENGTH, `At most ${NAME_MAX_LENGTH} characters.`),
  scopes: z.array(z.string()).min(1, "Select at least one permission."),
  lifetime: z.enum(["30d", "90d", "1y", "never"]),
});
type ApiKeyFormData = z.infer<typeof apiKeySchema>;

// Grant only dive reads by default; broader access requires a selection.
const FORM_DEFAULTS: ApiKeyFormData = {
  name: "",
  scopes: ["dives:read"],
  lifetime: "1y",
};

export function ApiKeyForm({
  onCreated,
  onCancel,
}: {
  onCreated: (key: ApiKeyCreated) => void;
  onCancel: () => void;
}) {
  const [createError, setCreateError] = useState<string | null>(null);
  const permissions = useOptionalList(
    loadPermissions,
    "Couldn't load supported permissions.",
  );

  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: FORM_DEFAULTS,
  });

  const selectedScopes = useWatch({ control, name: "scopes" });

  const onCreate = async (data: ApiKeyFormData) => {
    setCreateError(null);
    try {
      const key = await apiKeysAPI.createApiKey({ ...data, scope: "scoped" });
      onCreated(key);
    } catch (error) {
      // The cap's 409 and the limit's 429 say what to do; shown as they are.
      setCreateError(
        getApiErrorMessage(
          error,
          "Couldn't create that API key. Please try again.",
        ),
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onCreate)}
      className="space-y-4 rounded-lg border p-3"
    >
      <StatusMessage variant="error">{createError}</StatusMessage>

      <div className="space-y-2">
        <Label htmlFor="api-key-name">Name</Label>
        <Input
          id="api-key-name"
          autoFocus
          autoComplete="off"
          placeholder="laptop"
          maxLength={NAME_MAX_LENGTH}
          className={errors.name ? "border-destructive" : ""}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="max-w-xs space-y-2">
        <Label htmlFor="api-key-lifetime">Expires after</Label>
        <NativeSelect id="api-key-lifetime" {...register("lifetime")}>
          {Object.entries(LIFETIME_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {permissions.list.status === "ready" ? (
        <PermissionPicker
          legend="Key permissions"
          scopes={permissions.list.data}
          selected={selectedScopes}
          disabled={isSubmitting}
          onChange={(scopes) =>
            setValue("scopes", scopes, { shouldValidate: true })
          }
        />
      ) : permissions.list.status === "loading" ? (
        <SectionSpinner />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {permissions.list.status === "failed"
              ? permissions.list.message
              : "This API needs an update to support detailed permissions."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => permissions.refresh()}
          >
            Try again
          </Button>
        </div>
      )}
      {errors.scopes && (
        <p role="alert" className="text-sm text-destructive">
          {errors.scopes.message}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || permissions.list.status !== "ready"}
        >
          {isSubmitting && <ButtonSpinner className="mr-2" />}
          Create key
        </Button>
      </div>
    </form>
  );
}
