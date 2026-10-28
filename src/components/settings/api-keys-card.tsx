"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeySquare, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyField } from "@/components/ui/copy-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { StatusMessage } from "@/components/ui/status-message";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useOptionalList } from "@/hooks/useOptionalList";
import {
  apiKeysAPI,
  type ApiKey,
  type ApiKeyCreated,
  type ApiKeyLifetime,
  type ApiKeyScope,
} from "@/lib/api/api-keys";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime } from "@/lib/date-time";
import { PASSKEY_NAME_MAX_LENGTH } from "@/lib/passkey-name";

const LIST_FAILED = "Couldn't load your API keys.";
const loadApiKeys = () => apiKeysAPI.getApiKeys();

// Dates only, the passkey card's reason: the hour a key was made says nothing a
// diver deciding whether to revoke it needs.
const DAY = { year: "numeric", month: "short", day: "numeric" } as const;

// The API bounds a key's name with the passkey's own constant.
const NAME_MAX_LENGTH = PASSKEY_NAME_MAX_LENGTH;

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  read: "Read only",
  write: "Read and write",
};

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
  scope: z.enum(["read", "write"]),
  lifetime: z.enum(["30d", "90d", "1y", "never"]),
});
type ApiKeyFormData = z.infer<typeof apiKeySchema>;

// A year by default, so "never" is a choice somebody made; read-only by default,
// so writing is too.
const FORM_DEFAULTS: ApiKeyFormData = {
  name: "",
  scope: "read",
  lifetime: "1y",
};

/**
 * The account's API keys, for a diver's own tools: what each is called and may do,
 * when it was made, last used and expires, and the two things done about one -
 * make it and revoke it.
 *
 * **The secret is shown once and kept in nothing but this component's state.** The
 * API holds only a fingerprint, so the panel the create opens is the only place it
 * can ever be read; no storage key, URL or toast carries it, and it is gone on
 * navigation or reload, as Done makes it go sooner.
 *
 * Signing other devices out leaves keys working - a key is not a session - so the
 * description says each is revoked here, on its own.
 */
export function ApiKeysCard() {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  // Read once: a row's Expired badge is judged against when the card opened, which
  // a diver who leaves it open across the moment one lapses can refresh.
  const [now] = useState(() => Date.now());

  // An API predating keys 404s, and the whole card goes.
  const { list, refresh, update } = useOptionalList(loadApiKeys, LIST_FAILED);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: FORM_DEFAULTS,
  });

  const { deletingId, pendingId, requestDelete, cancelDelete, confirmDelete } =
    useDeleteResource((uuid: string) => apiKeysAPI.revokeApiKey(uuid), {
      successMessage: "That API key no longer works.",
      errorMessage: "Couldn't revoke that API key. Please try again.",
      onDeleted: async (uuid) => {
        if (created?.uuid === uuid) setCreated(null);
        await refresh();
      },
    });

  const keys = list.status === "ready" ? list.data : [];
  const pendingName = keys.find((one) => one.uuid === pendingId)?.name;

  const closeForm = () => {
    setIsCreating(false);
    setCreateError(null);
    reset(FORM_DEFAULTS);
  };

  const onCreate = async (data: ApiKeyFormData) => {
    setCreateError(null);
    try {
      const key = await apiKeysAPI.createApiKey(data);
      // Appended from the response rather than re-read: the list is oldest first,
      // and a second GET would answer what this one already did - without the
      // secret, which no later read carries.
      const row: ApiKey = {
        uuid: key.uuid,
        name: key.name,
        prefix: key.prefix,
        scope: key.scope,
        created_at: key.created_at,
        last_used_at: key.last_used_at,
        expires_at: key.expires_at,
      };
      update((current) => [...current, row]);
      setCreated(key);
      closeForm();
    } catch (error) {
      console.error("Couldn't create that API key.", error);
      // The cap's 409 and the limit's 429 say what to do; shown as they are.
      setCreateError(
        getApiErrorMessage(
          error,
          "Couldn't create that API key. Please try again.",
        ),
      );
    }
  };

  if (list.status === "absent") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className={CARD_TITLE_ROW}>
          <span className="flex items-center gap-2">
            <KeySquare className="h-5 w-5" />
            API keys
          </span>
          {!isCreating && list.status === "ready" && (
            <Button
              variant="outline"
              size="sm"
              className={CARD_TITLE_ACTION}
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create API key
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Let a script or a tool of your own use your account through the API. A
          key&apos;s secret is shown once, when you create it. Signing other
          devices out leaves keys working &mdash; each one is revoked here, on
          its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isCreating && (
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
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="api-key-scope">Access</Label>
                <NativeSelect id="api-key-scope" {...register("scope")}>
                  {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key-lifetime">Expires after</Label>
                <NativeSelect id="api-key-lifetime" {...register("lifetime")}>
                  {Object.entries(LIFETIME_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={closeForm}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <ButtonSpinner className="mr-2" />}
                Create key
              </Button>
            </div>
          </form>
        )}

        {list.status === "loading" && <SectionSpinner />}

        {list.status === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{list.message}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        )}

        {list.status === "ready" && keys.length === 0 && !isCreating && (
          <p className="text-sm text-muted-foreground">
            No API keys yet. Your browser and the OpenDiving app need none; a
            key is for a tool of your own.
          </p>
        )}

        {keys.map((key) => (
          <ApiKeyRow
            key={key.uuid}
            apiKey={key}
            now={now}
            secret={created?.uuid === key.uuid ? created.secret : null}
            onDone={() => setCreated(null)}
            isDeleting={deletingId === key.uuid}
            onRevoke={() => requestDelete(key.uuid)}
          />
        ))}
      </CardContent>

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Revoke API key"
        description={
          pendingName
            ? `"${pendingName}" stops working on its very next request, and can't be brought back - whatever uses it will need a new key.`
            : undefined
        }
        confirmText="Revoke"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}

function ApiKeyRow({
  apiKey,
  now,
  secret,
  onDone,
  isDeleting,
  onRevoke,
}: {
  apiKey: ApiKey;
  now: number;
  secret: string | null;
  onDone: () => void;
  isDeleting: boolean;
  onRevoke: () => void;
}) {
  const expired =
    apiKey.expires_at !== null && new Date(apiKey.expires_at).getTime() <= now;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-words">{apiKey.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {apiKey.prefix}&hellip;
            </span>
            <Badge variant="outline">{SCOPE_LABELS[apiKey.scope]}</Badge>
            {expired && <Badge variant="destructive">Expired</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Created {formatDateTime(apiKey.created_at, DAY)} ·{" "}
            {apiKey.last_used_at
              ? `Last used ${formatDateTime(apiKey.last_used_at, DAY)}`
              : "Never used"}{" "}
            ·{" "}
            {apiKey.expires_at
              ? `${expired ? "Expired" : "Expires"} ${formatDateTime(apiKey.expires_at, DAY)}`
              : "No expiry"}
          </p>
        </div>
        <IconTooltip label={`Revoke ${apiKey.name}`}>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDeleting}
            onClick={onRevoke}
          >
            {isDeleting ? <ButtonSpinner /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </IconTooltip>
      </div>

      {secret && (
        <div className="space-y-3 border-t pt-3">
          <CopyField
            value={secret}
            label="New API key"
            what="API key"
            copied="API key copied"
            selectHint="Select the key and copy it from there."
            mono
          />
          <p className="text-sm text-muted-foreground">
            Copy it now: it can&apos;t be shown again, because only a
            fingerprint of it is kept. Send it as{" "}
            <code className="font-mono text-xs">
              Authorization: Bearer &lt;key&gt;
            </code>
            .
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
