"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { contactsAPI, contactRoleLabel, Contact } from "@/lib/api/contacts";
import { formatWebsite } from "@/lib/contact";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { ContactsPageFrame } from "@/components/contacts/contacts-page-frame";
import { ContactDialog } from "@/components/contacts/contact-dialog";
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

// A dash for a cell with nothing in it, as the courses list draws one, so an empty
// cell reads as "not recorded" rather than as a rendering fault.
const NONE = <span className="text-muted-foreground">-</span>;

export default function ContactsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // `null` = the dialog is closed; a contact = editing it; `undefined` = creating.
  const [editingContact, setEditingContact] = useState<
    Contact | null | undefined
  >(null);

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

  // One term against both columns the API searches, the name and the city - the
  // same query the pickers run.
  const fetchContacts = useCallback(
    (page: number, perPage: number) =>
      contactsAPI.getContacts(page, perPage, search || undefined),
    [search],
  );

  const {
    items: contacts,
    isLoading: isLoadingContacts,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Contact>(fetchContacts, {
    keyOf: (contact) => contact.uuid,
    enabled: !!user,
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
                  className="hover:underline"
                >
                  {formatWebsite(contact.website)}
                </a>
              ) : (
                NONE
              )}
            </TableCell>
            <TableCell className="text-right">
              {/* Named per row, not per action - see DECISIONS.md, "Ten rows of
                  'Edit' name nothing". No view action: a contact is read and
                  changed in the one dialog, and has no page of its own. */}
              <div className="flex justify-end gap-2">
                <IconTooltip label={`Edit ${contact.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={ROW_ACTION}
                    onClick={() => setEditingContact(contact)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Delete ${contact.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={ROW_ACTION}
                    onClick={() => requestDelete(contact.uuid)}
                    disabled={deletingId === contact.uuid}
                  >
                    {deletingId === contact.uuid ? (
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
