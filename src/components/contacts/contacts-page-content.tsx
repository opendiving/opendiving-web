"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { contactsAPI, contactRoleLabel, Contact } from "@/lib/api/contacts";
import { formatWebsite } from "@/lib/contact";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ContactsPageFrame } from "@/components/contacts/contacts-page-frame";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";

// A dash for a cell with nothing in it, as the courses list draws one, so an empty
// cell reads as "not recorded" rather than as a rendering fault.
const NONE = <span className="text-muted-foreground">-</span>;

export function ContactsPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // `null` = the dialog is closed; a contact = editing it; `undefined` = creating.
  const [editingContact, setEditingContact] = useState<
    Contact | null | undefined
  >(null);

  const {
    input: searchInput,
    setInput: setSearchInput,
    term: search,
  } = useDebouncedSearch();

  // One term against both columns the API searches, the name and the city - the
  // same query the pickers run.
  const fetchContacts = useCallback(
    (page: number, perPage: number) =>
      contactsAPI.getContacts(page, perPage, { search }),
    [search],
  );

  const {
    items: contacts,
    isLoading: isLoadingContacts,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Contact>(fetchContacts, {
    keyOf: (contact) => contact.uuid,
    enabled: !!user,
    isNarrowed: search.length > 0,
    errorMessage: "Failed to load contacts. Please try again.",
  });

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteResource(contactsAPI.deleteContact, {
    // A plain confirm, no reassign offer: everything that names a contact
    // survives its deletion with the link gone, and nothing asks to move them.
    confirmMessage:
      "Are you sure you want to delete this contact? The dives, courses, certifications, service records and trip parts that name it keep everything else, but will no longer name it.",
    successMessage: "Contact deleted successfully.",
    errorMessage: "Failed to delete contact. Please try again.",
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
      <ContactsPageFrame
        isLoading={isLoadingContacts}
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
        onNew={() => setEditingContact(undefined)}
        rows={contacts.map((contact) => (
          <TableRow key={contact.uuid}>
            <TableCell className="font-medium">{contact.name}</TableCell>
            <TableCell>
              {contact.roles.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {contact.roles.map((role) => (
                    <Badge
                      key={role}
                      variant="secondary"
                      className="whitespace-nowrap"
                    >
                      {contactRoleLabel(role)}
                    </Badge>
                  ))}
                </div>
              ) : (
                NONE
              )}
            </TableCell>
            <TableCell>{contact.address?.city || NONE}</TableCell>
            <TableCell className="whitespace-nowrap">
              {contact.phone || NONE}
            </TableCell>
            <TableCell>
              {contact.website ? (
                <a
                  href={contact.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative hover:underline touch:tap-target"
                >
                  {formatWebsite(contact.website)}
                </a>
              ) : (
                NONE
              )}
            </TableCell>
            {/* No view action: a contact is read and changed in the one
                dialog, and has no page of its own. */}
            <RowActions
              label={contact.name}
              onEdit={() => setEditingContact(contact)}
              onDelete={() => requestDelete(contact.uuid)}
              isDeleting={deletingId === contact.uuid}
            />
          </TableRow>
        ))}
      />

      <ContactDialog
        open={editingContact !== null}
        onOpenChange={(open) => !open && setEditingContact(null)}
        contact={editingContact}
        onSaved={applySaved}
      />

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete contact"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </>
  );
}
