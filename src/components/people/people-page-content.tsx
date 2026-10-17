"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { peopleAPI, type Person } from "@/lib/api/people";
import { countNoun } from "@/lib/format";
import { RowActions } from "@/components/ui/row-actions";
import { PeoplePageFrame } from "@/components/people/people-page-frame";
import { PersonDialog } from "@/components/people/person-dialog";
import { useQuickCreate } from "@/components/layout/quick-create";
import { TableCell, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";

// A dash for a cell with nothing in it, as the contacts list draws one, so an
// empty cell reads as "not recorded" rather than as a rendering fault.
const NONE = <span className="text-muted-foreground">-</span>;

export function PeoplePageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const openCreate = useQuickCreate();
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  const {
    input: searchInput,
    setInput: setSearchInput,
    term: search,
  } = useDebouncedSearch();

  // One term against both columns the API searches, the name and the linked
  // username - the same query the pickers run.
  const fetchPeople = useCallback(
    (page: number, perPage: number) =>
      peopleAPI.getPeople(page, perPage, { search }),
    [search],
  );

  const {
    items: people,
    isLoading: isLoadingPeople,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Person>(fetchPeople, {
    keyOf: (person) => person.uuid,
    enabled: !!user,
    isNarrowed: search.length > 0,
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
        isCountNarrowed={isCountNarrowed}
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
              <Link
                href={`/people/${person.uuid}`}
                className="relative hover:underline touch:tap-target"
              >
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
                className="relative hover:underline touch:tap-target"
                aria-label={`${countNoun(person.dive_count, "dive")} with ${person.name}`}
              >
                {person.dive_count}
              </Link>
            </TableCell>
            <RowActions
              label={person.name}
              onEdit={() => setEditingPerson(person)}
              onDelete={() => requestDelete(person.uuid)}
              isDeleting={deletingId === person.uuid}
            />
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
