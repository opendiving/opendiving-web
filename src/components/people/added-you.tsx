"use client";

import { useEffect, useMemo, useState } from "react";
import { EyeOff, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/components/ui/use-toast";
import { PersonDialog } from "@/components/people/person-dialog";
import type { ConnectTarget } from "@/components/people/connected-account-head";
import { fetchAllPages } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/error";
import { peopleAPI, type AddedYouRow, type Person } from "@/lib/api/people";

interface AddedYouProps {
  // Called with the person an Add saved, so the list below takes it in.
  onAdded: (person: Person) => void;
}

const readAll = (signal: AbortSignal) =>
  fetchAllPages(
    (page, itemsPerPage) => peopleAPI.getAddedYou(page, itemsPerPage),
    { signal, label: "added you", keyOf: (row) => row.uuid },
  );

// The divers who have this diver in their people and whom this diver has not
// added: at the top of People, and only while there is somebody in it. Absent
// while it loads, and where the read fails - the list below is the page.
export function AddedYou({ onAdded }: AddedYouProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AddedYouRow[]>([]);
  const [adding, setAdding] = useState<AddedYouRow | null>(null);
  const [disconnecting, setDisconnecting] = useState<AddedYouRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // A promise chain for `react-hooks/set-state-in-effect`.
    readAll(controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setRows(found);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          console.error("Couldn't read who added you.", error);
      });
    return () => controller.abort();
  }, []);

  const drop = (uuid: string) =>
    setRows((current) => current.filter((row) => row.uuid !== uuid));

  const act = async (
    row: AddedYouRow,
    call: (uuid: string) => Promise<unknown>,
    done: string,
    failed: string,
  ) => {
    setBusy(row.uuid);
    try {
      await call(row.uuid);
      drop(row.uuid);
      toast({ title: done });
    } catch (error) {
      console.error(failed, error);
      toast({
        title: "Error",
        description: getApiErrorMessage(error, failed),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  // One object per row opened, since the dialog reloads itself when it changes.
  const connecting = useMemo<ConnectTarget | null>(
    () =>
      adding && {
        via: "account",
        uuid: adding.uuid,
        name: adding.name,
        username: adding.username,
        avatarSha: adding.avatar_sha256 ?? null,
      },
    [adding],
  );

  if (rows.length === 0 && !adding) return null;

  return (
    <>
      {rows.length > 0 && (
        <Card className="mb-6 max-sm:mb-2.5">
          <CardHeader>
            <CardTitle as="h2">Added you</CardTitle>
            <CardDescription>
              These divers have you in their people, and see your picture and
              username.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {rows.map((row) => (
                <li
                  key={row.uuid}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
                >
                  <UserAvatar
                    name={row.name}
                    avatarSha={row.avatar_sha256}
                    source={{ kind: "added-you", uuid: row.uuid }}
                    size={40}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      @{row.username}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setAdding(row)}
                      disabled={busy === row.uuid}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === row.uuid}
                      onClick={() =>
                        void act(
                          row,
                          peopleAPI.hideAddedYou,
                          `${row.name} is hidden`,
                          "Couldn't hide them. Please try again.",
                        )
                      }
                    >
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === row.uuid}
                      onClick={() => setDisconnecting(row)}
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <PersonDialog
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        connecting={connecting}
        onSaved={(person) => {
          if (adding) drop(adding.uuid);
          onAdded(person);
        }}
      />

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title="Disconnect"
        description={
          disconnecting
            ? `${disconnecting.name} keeps you in their people by name, without your picture or username, and is not told. They can connect again with your connect link until you reset it.`
            : ""
        }
        confirmText="Disconnect"
        isLoading={disconnecting !== null && busy === disconnecting.uuid}
        onConfirm={async () => {
          if (!disconnecting) return;
          await act(
            disconnecting,
            peopleAPI.disconnectAddedYou,
            `${disconnecting.name} is disconnected`,
            "Couldn't disconnect them. Please try again.",
          );
          setDisconnecting(null);
        }}
      />
    </>
  );
}
