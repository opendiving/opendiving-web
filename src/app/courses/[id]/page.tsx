"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { coursesAPI, Course } from "@/lib/api/courses";
import { certificationAgencyLabel } from "@/lib/api/certifications";
import { courseStatusBadgeVariant, courseStatusLabel } from "@/lib/course";
import { formatDateTime, formatTripDateRange } from "@/lib/date-time";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { CourseCertificationsCard } from "@/components/courses/course-certifications-card";
import { CourseDialog } from "@/components/courses/course-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { DetailPageSkeleton } from "@/components/ui/page-skeleton";
import { NotFoundState } from "@/components/ui/not-found-state";
import {
  BadgeCheck,
  Edit,
  Trash2,
  Plus,
  GraduationCap,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// One labelled fact in the course's info card, rendered only when the course
// records it - the same shape the dive sidebar's blocks use.
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

export default function CourseDetailPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);
  // Held here rather than in the certifications card, because the sidebar's
  // button opens the same dialog the card's empty state does.
  const [isAddingCertification, setIsAddingCertification] = useState(false);

  const {
    resource: course,
    setResource: setCourse,
    isLoading: isLoadingCourse,
  } = useResource<Course>(coursesAPI.getCourse, {
    enabled: !!user,
    errorMessage: "Failed to load course details. Please try again.",
    redirectTo: "/courses",
  });

  const del = useDeleteResource(coursesAPI.deleteCourse, {
    // A plain confirm, no reassign offer: deleting a course unlinks it from the
    // dives and cards that named it, and there is nothing to hand them to.
    confirmMessage:
      "Are you sure you want to delete this course? The dives and certifications on it are kept, but they will no longer name it.",
    successMessage: "Course deleted successfully.",
    errorMessage: "Failed to delete course. Please try again.",
    onDeleted: () => router.push("/courses"),
  });
  const isDeleting = del.deletingId !== null;

  const courseDateRange = course
    ? formatTripDateRange(
        course.start_date ?? undefined,
        course.end_date ?? undefined,
        { year: "numeric", month: "long", day: "numeric" },
      )
    : undefined;

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingCourse) {
    return (
      <DetailPageSkeleton backHref="/courses" backLabel="Back to courses" />
    );
  }

  if (!course) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Course not found."
          backHref="/courses"
          backLabel="Back to courses"
        />
      </div>
    );
  }

  const agencyLabel = certificationAgencyLabel(
    course.agency,
    course.agency_other,
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/courses"
        backLabel="Back to courses"
        title={course.name}
        subtitle={
          agencyLabel && courseDateRange
            ? `${agencyLabel} · ${courseDateRange}`
            : (agencyLabel ?? courseDateRange ?? undefined)
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.requestDelete(course.uuid)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </>
        }
      />

      <CourseDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        course={course}
        onSaved={setCourse}
      />

      <ConfirmDialog
        open={del.pendingId !== null}
        onOpenChange={(open) => !open && del.cancelDelete()}
        title="Delete course"
        description={del.confirmMessage}
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={del.confirmDelete}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RecentDivesCard
            complete
            enabled={!!user}
            courseId={course.uuid}
            title="Dives on this Course"
            description="All dives logged as part of this course"
            viewAllHref={null}
            emptyTitle="No dives logged for this course yet"
            emptyDescription="Log a dive and assign it to this course to see it here."
            newDiveHref={`/dives/new?course_uuid=${course.uuid}`}
            newDiveLabel="Log a dive for this course"
          />

          <CourseCertificationsCard
            course={course}
            isAdding={isAddingCertification}
            onAddingChange={setIsAddingCertification}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Course Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="Status">
                <Badge variant={courseStatusBadgeVariant(course.status)}>
                  {courseStatusLabel(course.status)}
                </Badge>
              </InfoRow>
              {agencyLabel && <InfoRow label="Agency">{agencyLabel}</InfoRow>}
              {courseDateRange && (
                <InfoRow label="Course Dates">{courseDateRange}</InfoRow>
              )}
              {course.training_center && (
                <InfoRow label="Training center">
                  {course.training_center}
                </InfoRow>
              )}
              {course.instructor_name && (
                <InfoRow label="Instructor">{course.instructor_name}</InfoRow>
              )}
              {course.instructor_number && (
                <InfoRow label="Instructor number">
                  {course.instructor_number}
                </InfoRow>
              )}
              {course.notes && (
                <InfoRow label="Notes">
                  <span className="whitespace-pre-wrap">{course.notes}</span>
                </InfoRow>
              )}
              <InfoRow label="Created on">
                {formatDateTime(course.created_at, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </InfoRow>
              <div className="space-y-2">
                <Button className="w-full" asChild>
                  <Link href={`/dives/new?course_uuid=${course.uuid}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Log a dive
                  </Link>
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setIsAddingCertification(true)}
                >
                  <BadgeCheck className="h-4 w-4 mr-2" />
                  Add a certification
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
