"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { peopleAPI, type Person } from "@/lib/api/people";
import { formatDateTime } from "@/lib/date-time";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { PersonDialog } from "@/components/people/person-dialog";
import { Button } from "@/components/ui/button";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import { PageSpinner } from "@/components/ui/page-spinner";
import { Edit, User } from "lucide-react";

// One labelled fact in the person's info card, rendered only when it is
// recorded - the shape the course page's rows take.
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// One person: what the diver keeps about them, and every dive that names them.
// The dives are the list's `person_uuid` filter, the same rows the People page's
// count counts, so the two always agree.
export function PersonDetailPageContent() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const {
    resource: person,
    setResource: setPerson,
    isLoading: isLoadingPerson,
  } = useResource<Person>(peopleAPI.getPerson, {
    enabled: !!user,
    errorMessage: "Failed to load this person. Please try again.",
    redirectTo: "/people",
  });
  useDocumentTitle(person?.name, "People");

  const del = useDeleteResource(peopleAPI.deletePerson, {
    // A plain confirm, as on the People page: nothing that names a person is
    // lost with them but the name.
    confirmMessage:
      "Are you sure you want to delete this person? The dives, trips and courses they were on keep everything else, but will no longer name them, and the certifications they signed will name no instructor.",
    successMessage: "Person deleted successfully.",
    errorMessage: "Failed to delete person. Please try again.",
    onDeleted: () => router.push("/people"),
  });
  const isDeleting = del.deletingId !== null;

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingPerson) {
    return <DetailPageSkeleton backHref="/people" backLabel="Back to people" />;
  }

  if (!person) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <NotFoundState
          message="Person not found."
          backHref="/people"
          backLabel="Back to people"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <PageHeader
        backHref="/people"
        backLabel="Back to people"
        title={person.name}
        subtitle={person.username ? `@${person.username}` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <ItemActionsMenu>
              <DeleteMenuItem
                onSelect={() => del.requestDelete(person.uuid)}
                disabled={isDeleting}
              />
            </ItemActionsMenu>
          </>
        }
      />

      <PersonDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        person={person}
        onSaved={setPerson}
      />

      <ConfirmDialog
        open={del.pendingId !== null}
        onOpenChange={(open) => !open && del.cancelDelete()}
        title="Delete person"
        description={del.confirmMessage}
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={del.confirmDelete}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentDivesCard
            complete
            enabled={!!user}
            personId={person.uuid}
            title="Dives Together"
            description="Every dive that names them"
            viewAllHref={null}
            emptyTitle="No dives with them yet"
            emptyDescription="Add them to a dive's people to see it here."
            newDiveHref="/dives/new"
            newDiveLabel="Log a dive"
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Person Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* The linked account's current username and nothing else of
                  theirs: the link shows the diver that much, and the account
                  is told nothing. */}
              {person.username && (
                <InfoRow label="Username">@{person.username}</InfoRow>
              )}
              {person.email && (
                <InfoRow label="Email">
                  <a
                    href={`mailto:${person.email}`}
                    className="hover:underline"
                  >
                    {person.email}
                  </a>
                </InfoRow>
              )}
              {person.phone && (
                <InfoRow label="Phone">
                  <a
                    href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
                    className="hover:underline"
                  >
                    {person.phone}
                  </a>
                </InfoRow>
              )}
              {person.notes && (
                <InfoRow label="Notes">
                  <span className="whitespace-pre-wrap">{person.notes}</span>
                </InfoRow>
              )}
              <InfoRow label="Added on">
                {formatDateTime(person.created_at, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </InfoRow>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
