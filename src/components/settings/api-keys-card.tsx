"use client";

import { useState } from "react";
import Link from "next/link";
import { KeySquare, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { SectionSpinner } from "@/components/ui/section-spinner";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useOptionalList } from "@/hooks/useOptionalList";
import { apiKeysAPI, type ApiKeyCreated } from "@/lib/api/api-keys";

import { ApiKeyForm } from "./api-key-form";
import { ApiKeyRow } from "./api-key-row";

const LIST_FAILED = "Couldn't load your API keys.";
const loadApiKeys = () => apiKeysAPI.getApiKeys();

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
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  // Read once: a row's Expired badge is judged against when the card opened, which
  // a diver who leaves it open across the moment one lapses can refresh.
  const [now] = useState(() => Date.now());

  // An API predating keys 404s, and the whole card goes.
  const { list, refresh, update } = useOptionalList(loadApiKeys, LIST_FAILED);

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
          its own. The{" "}
          <Link href="/developers" className="underline hover:text-foreground">
            API reference
          </Link>{" "}
          documents available operations. Each key can use only the permissions
          you grant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isCreating && (
          <ApiKeyForm
            onCancel={() => setIsCreating(false)}
            onCreated={(key) => {
              const { secret: _secret, ...row } = key;
              update((current) => [...current, row]);
              setCreated(key);
              setIsCreating(false);
            }}
          />
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
