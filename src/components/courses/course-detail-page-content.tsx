"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useResource } from "@/hooks/useResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useReturnTo, useWithReturnTo } from "@/hooks/useReturnTo";
import { useContact } from "@/hooks/useContact";
import { usePeopleByUuid } from "@/hooks/usePeopleByUuid";
import { splitCourseInstructor } from "@/lib/people";
import { coursesAPI, Course } from "@/lib/api/courses";
import { certificationAgencyLabel } from "@/lib/api/certifications";
import { courseStatusLabel } from "@/lib/course";
import { formatTripDateRange } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { CourseCertificationsCard } from "@/components/courses/course-certifications-card";
import { CourseDialog } from "@/components/courses/course-dialog";
import { PeopleList } from "@/components/people/people-list";
import { Button } from "@/components/ui/button";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  HERO_BODY,
  HERO_CONTROL,
  MapHeroPageSkeleton,
  PlainHero,
} from "@/components/ui/map-hero";
import { NotFoundState } from "@/components/ui/not-found-state";
import { BadgeCheck, Edit, Plus, GraduationCap } from "lucide-react";
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

export function CourseDetailPageContent() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const [isEditOpen, setIsEditOpen] = useState(false);
  // Held here rather than in the certifications card, because the sidebar's
  // button opens the same dialog the card's empty state does.
  const [isAddingCertification, setIsAddingCertification] = useState(false);
  const back = useReturnTo({ href: "/courses", label: "Back to courses" });
  const withReturnTo = useWithReturnTo();

  const {
    resource: course,
    setResource: setCourse,
    isLoading: isLoadingCourse,
  } = useResource<Course>(coursesAPI.getCourse, {
    enabled: !!user,
    errorMessage: "Failed to load course details. Please try again.",
    redirectTo: "/courses",
  });
  useDocumentTitle(course?.name, "Courses");

  const del = useDeleteResource(coursesAPI.deleteCourse, {
    // A plain confirm, no reassign offer: deleting a course unlinks it from the
    // dives and cards that named it, and there is nothing to hand them to.
    confirmMessage:
      "Are you sure you want to delete this course? The dives and certifications on it are kept, but they will no longer name it.",
    successMessage: "Course deleted successfully.",
    errorMessage: "Failed to delete course. Please try again.",
    onDeleted: () => router.push(back.href),
  });
  const isDeleting = del.deletingId !== null;

  const contact = useContact(course?.contact_uuid);
  // The instructor on a row of their own, as the dialog holds them, and everyone
  // else on the course under it.
  const { instructorUuid, others } = splitCourseInstructor(course?.people);
  const people = usePeopleByUuid(
    (course?.people ?? []).map((reference) => reference.person_uuid),
  );
  const instructor = instructorUuid ? people[instructorUuid] : undefined;

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (isLoadingCourse) {
    return (
      <MapHeroPageSkeleton
        plain
        figureless
        backHref={back.href}
        backLabel={back.label}
        icon={GraduationCap}
      />
    );
  }

  if (!course) {
    return (
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 lg:px-8 pt-8 pb-6">
        <NotFoundState
          message="Course not found."
          backHref={back.href}
          backLabel={back.label}
        />
      </div>
    );
  }

  // In the courses table's formats, so a course reads the same on its page as
  // in the list.
  const subtitle = [
    certificationAgencyLabel(course.agency, course.agency_other),
    formatTripDateRange(
      course.start_date ?? undefined,
      course.end_date ?? undefined,
    ),
    courseStatusLabel(course.status),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PlainHero
        backHref={back.href}
        backLabel={back.label}
        icon={GraduationCap}
        title={course.name}
        subtitle={subtitle || undefined}
        figures={[]}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className={HERO_CONTROL}
              onClick={() => setIsEditOpen(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <ItemActionsMenu variant="ghost" size="sm" className={HERO_CONTROL}>
              <DeleteMenuItem
                onSelect={() => del.requestDelete(course.uuid)}
                disabled={isDeleting}
              />
            </ItemActionsMenu>
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

      <div
        className={cn(
          HERO_BODY,
          "grid grid-cols-1 lg:grid-cols-3 gap-6 max-sm:gap-2.5",
        )}
      >
        <div className="lg:col-span-2 space-y-6 max-sm:space-y-2.5">
          <CourseCertificationsCard
            course={course}
            isAdding={isAddingCertification}
            onAddingChange={setIsAddingCertification}
          />

          <RecentDivesCard
            complete
            enabled={!!user}
            courseId={course.uuid}
            title="Dives on This Course"
            description="All dives logged as part of this course"
            viewAllHref={null}
            emptyTitle="No dives logged for this course yet"
            emptyDescription="Log a dive and assign it to this course to see it here."
            newDiveHref={`/dives/new?course_uuid=${course.uuid}`}
            newDiveLabel="Log a dive for this course"
          />
        </div>

        <div className="space-y-6 max-sm:space-y-2.5">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Course Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contact && <InfoRow label="Dive center">{contact.name}</InfoRow>}
              {instructor && (
                <InfoRow label="Instructor">
                  <Link
                    href={withReturnTo(`/people/${instructor.uuid}`)}
                    className="hover:underline"
                  >
                    {instructor.name}
                  </Link>
                </InfoRow>
              )}
              {course.instructor_number && (
                <InfoRow label="Instructor number">
                  {course.instructor_number}
                </InfoRow>
              )}
              {others.some((reference) => people[reference.person_uuid]) && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    People
                  </div>
                  <PeopleList people={others} resolved={people} />
                </div>
              )}
              {course.notes && (
                <InfoRow label="Notes">
                  <span className="whitespace-pre-wrap">{course.notes}</span>
                </InfoRow>
              )}
              {/* Two columns exactly where the sidebar is wide: it is the full
                  content width until `lg`, where it becomes a third of it and
                  the pair no longer fits across. */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button asChild>
                  <Link
                    href={withReturnTo(`/dives/new?course_uuid=${course.uuid}`)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Log a dive
                  </Link>
                </Button>
                <Button
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
