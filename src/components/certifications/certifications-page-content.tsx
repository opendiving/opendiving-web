"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useSavedElsewhere } from "@/hooks/useSavedElsewhere";
import { certificationsAPI, Certification } from "@/lib/api/certifications";
import { CertificationsPageFrame } from "@/components/certifications/certifications-page-frame";
import { CertificationCard } from "@/components/certifications/certification-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CertificationViewDialog } from "@/components/certifications/certification-view-dialog";

export function CertificationsPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();

  // `null` = the dialog is closed; a certification = editing it; `undefined` = creating.
  const [editing, setEditing] = useState<Certification | null | undefined>(
    null,
  );
  const [viewing, setViewing] = useState<Certification | null>(null);

  const fetchCertifications = useCallback(
    (page: number, perPage: number) =>
      certificationsAPI.getCertifications(page, perPage),
    [],
  );

  const {
    items: certifications,
    isLoading,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Certification>(fetchCertifications, {
    keyOf: (certification) => certification.uuid,
    enabled: !!user,
    errorMessage: "Failed to load certifications. Please try again.",
  });

  useSavedElsewhere("certification", ({ certification }) =>
    applySaved(certification),
  );

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteResource(certificationsAPI.deleteCertification, {
    confirmMessage:
      "Are you sure you want to delete this certification? The card images stored with it are permanently deleted too.",
    successMessage: "Certification deleted successfully.",
    errorMessage: "Failed to delete certification. Please try again.",
    // The card goes locally rather than by re-reading the pages around it: a
    // diver who has scrolled several pages in should not have the list
    // collapse back to the first one under them.
    onDeleted: removeItem,
  });

  if (isAuthLoading || !isAuthenticated) {
    return <PageSpinner variant="inset" />;
  }

  return (
    <>
      <CertificationsPageFrame
        isLoading={isLoading}
        totalCount={totalCount}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onNew={() => setEditing(undefined)}
        cards={certifications.map((certification) => (
          <CertificationCard
            key={certification.uuid}
            certification={certification}
            onView={() => setViewing(certification)}
            onEdit={() => setEditing(certification)}
            onDelete={() => requestDelete(certification.uuid)}
            isDeleting={deletingId === certification.uuid}
          />
        ))}
      />

      {user && (
        <CertificationDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          certification={editing}
          // The card images ride on that dialog's own save, so the certification
          // it hands back already carries whatever landed.
          onSaved={applySaved}
        />
      )}

      <CertificationViewDialog
        certification={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete certification"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </>
  );
}
