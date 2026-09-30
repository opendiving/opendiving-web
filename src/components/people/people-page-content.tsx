"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { peopleAPI, type Person } from "@/lib/api/people";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { PeoplePageFrame } from "@/components/people/people-page-frame";
import { PersonDialog } from "@/components/people/person-dialog";
import { useQuickCreate } from "@/components/layout/quick-create";
import { TableCell, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Edit, Trash2, Loader2 } from "lucide-react";
import { PageSpinner } from "@/components/ui/page-spinner";

// How long to wait after the last keystroke before asking the server, matching
// the other lists and the pickers.
const SEARCH_DEBOUNCE_MS = 250;

// The row's two controls at a finger's size on a phone, where a table row is
// tapped; from `sm` up they take the other lists' size.
const ROW_ACTION = "h-11 w-11 sm:h-9 sm:w-9";

// A dash for a cell with nothing in it, as the contacts list draws one, so an
// empty cell reads as "not recorded" rather than as a rendering fault.
const NONE = <span className="text-muted-foreground">-</span>;

export function PeoplePageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const openCreate = useQuickCreate();
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  // What the box holds, and what has actually been asked for.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  // One term against both columns the API searches, the name and the linked
  // username - the same query the pickers run.
  const fetchPeople = useCallback(
    (page: number, perPage: number) =>
      peopleAPI.getPeople(page, perPage, search || undefined),
    [search],
  );

  const {
    items: people,
    isLoading: isLoadingPeople,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Person>(fetchPeople, {
    keyOf: (person) => person.uuid,
    enabled: !!user,
    errorMessage: "Failed to load people. Please try again.",
  });

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteResource(peopleAPI.deletePerson, {
    // A plain confirm, no reassign offer: everything that names a person keeps
    // everything else when they go, and nothing asks to move them.
    confirmMessage:
      "Are you sure you want to delete this person? The dives, trips and courses they were on keep everything else, but will no longer name them, and the certifications they signed will name no instructor.",
    successMessage: "Person deleted successfully.",
    errorMessage: "Failed to delete person. Please try again.",
    onDeleted: removeItem,
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <>
      <PeoplePageFrame
        isLoading={isLoadingPeople}
        totalCount={totalCount}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        search={searchInput}
        onSearchChange={setSearchInput}
        isSearching={search.length > 0}
        onNew={() => openCreate("person")}
        rows={people.map((person) => (
          <TableRow key={person.uuid}>
            <TableCell className="font-medium">
              <Link href={`/people/${person.uuid}`} className="hover:underline">
                {person.name}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {person.username ? `@${person.username}` : NONE}
            </TableCell>
            <TableCell>{person.email || NONE}</TableCell>
            <TableCell className="whitespace-nowrap">
              {person.phone || NONE}
            </TableCell>
            <TableCell className="tabular-nums">
              {/* The count is the way into the dives it counts, which the
                  person's page lists. */}
              <Link
                href={`/people/${person.uuid}`}
                className="hover:underline"
                aria-label={`${person.dive_count} ${
                  person.dive_count === 1 ? "dive" : "dives"
                } with ${person.name}`}
              >
                {person.dive_count}
              </Link>
            </TableCell>
            <TableCell className="text-right">
              {/* Named per row, not per action - see DECISIONS.md, "Ten rows of
                  'Edit' name nothing". */}
              <div className="flex justify-end gap-2">
                <IconTooltip label={`Edit ${person.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={ROW_ACTION}
                    onClick={() => setEditingPerson(person)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Delete ${person.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={ROW_ACTION}
                    onClick={() => requestDelete(person.uuid)}
                    disabled={deletingId === person.uuid}
                  >
                    {deletingId === person.uuid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </IconTooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      />

      <PersonDialog
        open={editingPerson !== null}
        onOpenChange={(open) => !open && setEditingPerson(null)}
        person={editingPerson}
        onSaved={applySaved}
      />

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete person"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </>
  );
}
