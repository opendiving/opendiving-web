"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Edit, Loader2, Tags, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useTags } from "@/hooks/useTags";
import { getApiErrorMessage } from "@/lib/api/error";
import { tagsAPI, type Tag } from "@/lib/api/tags";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/tooltip";

const diveCount = (count: number) =>
  count === 1 ? "1 dive" : `${count} dives`;
const siteCount = (count: number) =>
  count === 1 ? "1 site" : `${count} sites`;

// How many of each carry the tag. The sites only where there are some, since
// most tags are a dive's alone; the dives always, so a tag carried by nothing
// still reads as "0 dives" rather than as a bare name.
const usage = (tag: Tag) =>
  tag.site_count > 0
    ? `${diveCount(tag.dive_count)}, ${siteCount(tag.site_count)}`
    : diveCount(tag.dive_count);

/**
 * The diver's tags, each with how many dives and sites carry it, renamed in the
 * row and deleted with a confirmation.
 *
 * The one place a tag is managed rather than used: the dive and site forms'
 * picker adds them and the two lists filter by them, and none of those can
 * rename or delete one. A tag nothing carries any more is still listed, at 0
 * dives, because it stays until it is deleted - the picker keeps offering a word
 * the diver still uses.
 *
 * **Renaming happens in the row**, the preset list's shape: the pencil turns the
 * name into a field with a tick to save and a cross to stop, and the row's delete
 * goes while it is open, so a delete button never sits beside a half-typed
 * rename. A name another tag already has, compared case-folded, is refused by the
 * API, and the row stays open with the reason under the list.
 */
export function TagsCard() {
  const { user } = useAuth();
  const { tags, loadFailed, reload } = useTags(!!user);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const stopEditing = () => {
    setEditing(null);
    setDraftName("");
    setError(null);
  };

  const handleRename = async () => {
    const name = draftName.trim();
    if (!name || !editing) return;
    // An unchanged name is not a rename, and spends no request.
    if (name === editing.name) {
      stopEditing();
      return;
    }
    setError(null);
    try {
      setIsSaving(true);
      await tagsAPI.renameTag(editing.uuid, name);
      stopEditing();
      reload();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to rename. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteResource(tagsAPI.deleteTag, {
    confirmMessage:
      "Are you sure you want to delete this tag? The dives and sites carrying it keep everything else, but will no longer be filed under it.",
    successMessage: "Tag deleted successfully.",
    errorMessage: "Failed to delete tag. Please try again.",
    onDeleted: reload,
  });

  const busy = isSaving || deletingId !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Tags className="h-5 w-5" />
          Tags
        </CardTitle>
        <CardDescription>
          The words you file dives and dive sites under. A rename reaches
          everything carrying the tag.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tags === null ? (
          <p className="text-sm text-muted-foreground">
            {loadFailed ? "Your tags could not be loaded." : "Loading tags..."}
          </p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags yet. Add one to a dive or a dive site from its form.
          </p>
        ) : (
          <ul className="space-y-1">
            {tags.map((tag) => {
              const isEditing = editing?.uuid === tag.uuid;
              return (
                <li
                  key={tag.uuid}
                  className="flex flex-wrap items-center gap-2"
                >
                  {isEditing ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleRename();
                      }}
                    >
                      <Input
                        ref={nameInputRef}
                        value={draftName}
                        aria-label={`New name for "${tag.name}"`}
                        disabled={isSaving}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="h-8 min-w-0 flex-1"
                      />
                      <IconTooltip
                        label={`Save the new name for "${tag.name}"`}
                      >
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={isSaving || draftName.trim().length === 0}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                      </IconTooltip>
                      <IconTooltip label={`Stop renaming "${tag.name}"`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSaving}
                          onClick={stopEditing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 break-all text-sm">
                        {tag.name}
                        <span className="text-muted-foreground">
                          {" "}
                          · {usage(tag)}
                        </span>
                      </span>
                      <IconTooltip label={`Rename "${tag.name}"`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            setDraftName(tag.name);
                            setEditing(tag);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                      <IconTooltip label={`Delete "${tag.name}"`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => requestDelete(tag.uuid)}
                        >
                          {deletingId === tag.uuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </IconTooltip>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <FormApiError error={error} />
      </CardContent>

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete tag"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
