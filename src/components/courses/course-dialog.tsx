"use client";

import { useCallback } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { NativeSelect } from "@/components/ui/native-select";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { courseSchema, CourseInput } from "@/lib/validations/course";
import {
  coursesAPI,
  Course,
  COURSE_STATUSES,
  DEFAULT_COURSE_STATUS,
} from "@/lib/api/courses";
import { courseStatusLabel } from "@/lib/course";
import { joinCourseInstructor, splitCourseInstructor } from "@/lib/people";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogSubmitButton } from "@/components/ui/dialog-submit-button";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { PeopleMultiSelect } from "@/components/people/people-multi-select";
import { TrainingFields } from "./training-fields";

interface CourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing course to edit it; omit to create a new one.
  course?: Course | null;
  // Called with the created/updated course so the caller can refresh whatever
  // list it's showing - and, in the pickers, select it straight away.
  onSaved: (course: Course) => void;
}

// The one create/edit form for a course, used by the courses list and detail
// pages, the header's quick-create menu, and the course pickers on the dive form
// and in the certification dialog.
//
// A dialog rather than `new`/`edit` pages, following trips and certifications:
// the flow that matters most is adding a course from inside a half-filled dive
// form or an open certification dialog, and navigating away would mean either
// losing that form or building draft-persistence for it. Link management stays
// out of here for the same reason it stays out of `TripDialog` - a dive picks
// its course on the dive form, a certification on its own.
export function CourseDialog({
  open,
  onOpenChange,
  course,
  onSaved,
}: CourseDialogProps) {
  const [apiError, setApiError, handleOpenChange] = useDialogApiError(
    open,
    onOpenChange,
  );
  const isEdit = !!course;

  const form = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      name: "",
      // No agency chosen: a diver who never opens the picker stores nothing
      // rather than a fabricated PADI.
      agency: null,
      agency_other: "",
      status: DEFAULT_COURSE_STATUS,
      start_date: "",
      end_date: "",
      instructor_uuid: null,
      instructor_number: "",
      contact_uuid: null,
      people: [],
      notes: "",
    },
  });

  const instructorUuid = useWatch({
    control: form.control,
    name: "instructor_uuid",
  });
  // The pickers rank by last use on a dive at or before the course's start.
  const until =
    useWatch({ control: form.control, name: "start_date" }) || undefined;

  // Reload the form whenever the dialog opens, so it shows the course being
  // edited rather than whatever the previous invocation left behind.
  const { reset, getValues, setValue } = form;
  useEffectOnChange(() => {
    if (!open) return;
    const { instructorUuid, others } = splitCourseInstructor(course?.people);
    reset({
      name: course?.name ?? "",
      agency: course?.agency ?? null,
      agency_other: course?.agency_other ?? "",
      status: course?.status ?? DEFAULT_COURSE_STATUS,
      start_date: course?.start_date ?? "",
      end_date: course?.end_date ?? "",
      instructor_uuid: instructorUuid,
      instructor_number: course?.instructor_number ?? "",
      contact_uuid: course?.contact_uuid ?? null,
      people: others,
      notes: course?.notes ?? "",
    });
    // Same deliberate reset-on-open pattern as `certification-dialog.tsx`;
    // clearing a stale value when the dialog reopens is exactly the "sync to a
    // prop change" case this rule can't distinguish from a cascading render.
  }, [open, course, reset]);

  // A person made the instructor leaves the list below, where they would
  // otherwise be named twice - once as the instructor and once as a student.
  const pickInstructor = useCallback(
    (uuid: string | null) => {
      setValue("instructor_uuid", uuid, { shouldDirty: true });
      if (!uuid) return;
      const people = getValues("people") ?? [];
      if (people.some((reference) => reference.person_uuid === uuid)) {
        setValue(
          "people",
          people.filter((reference) => reference.person_uuid !== uuid),
          { shouldDirty: true },
        );
      }
    },
    [getValues, setValue],
  );

  const onSubmit = async (data: CourseInput) => {
    setApiError(null);
    try {
      // "" is the form's "not set" state for every optional field. On update they
      // go as an explicit null so clearing one actually clears it rather than
      // being ignored as an omitted key; the API's `CourseUpdate` keeps exactly
      // these fields off `NON_NULLABLE_FIELDS` for that. On create the same nulls
      // simply store nothing.
      //
      // `agency` is one of them: a course need not name one, and the picker's
      // own "not set" is already `null`, so clearing it here clears the stored
      // value rather than being ignored.
      //
      // `agency_other` is the exception: the API rejects a non-null value unless
      // the agency is "other", so switching away from "other" must send null
      // rather than the stale name still sitting in the form state.
      const shared = {
        name: data.name.trim(),
        agency: data.agency,
        agency_other:
          data.agency === "other" ? data.agency_other || null : null,
        status: data.status,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        instructor_number: data.instructor_number || null,
        // Sent as `null` when cleared, which is what unlinks it on an update.
        contact_uuid: data.contact_uuid ?? null,
        // The whole list on every save, the instructor first - the API replaces
        // it, so a cleared instructor is simply one no longer on it.
        people: joinCourseInstructor(data.instructor_uuid, data.people ?? []),
        notes: data.notes || "",
      };

      if (course) {
        // The API answers a PATCH with a status message only, so the updated
        // course is assembled here for the caller.
        await coursesAPI.updateCourse(course.uuid, shared);
        onSaved({ ...course, ...shared });
      } else {
        const created = await coursesAPI.createCourse({
          ...shared,
        });
        onSaved(created);
      }

      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} course. Please try again.`,
        ),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Course" : "New Course"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` keeps this submit from bubbling into the form
              this dialog can be opened from - the dive form, or the
              certification dialog's own form. See `lib/dialog-form.ts`. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course *</FormLabel>
                  <FormControl
                    render={
                      <Input
                        placeholder="e.g. Advanced Nitrox + Decompression Procedures"
                        autoFocus
                        {...field}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <TrainingFields
              agencyRequired={false}
              besideAgency={
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <FormControl
                        render={
                          <NativeSelect {...field}>
                            {COURSE_STATUSES.map((value) => (
                              <option key={value} value={value}>
                                {courseStatusLabel(value)}
                              </option>
                            ))}
                          </NativeSelect>
                        }
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
              dates={[
                { name: "start_date", label: "Start date" },
                { name: "end_date", label: "End date" },
              ]}
              until={until}
              onInstructorChange={pickInstructor}
            />

            <FormField
              control={form.control}
              name="people"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>People</FormLabel>
                  <FormControl
                    render={
                      /* A student until the diver says otherwise: on a course,
                        the people beside the diver are mostly the rest of the
                        class. The instructor has the field above. */ <PeopleMultiSelect
                        value={field.value ?? []}
                        onChange={field.onChange}
                        defaultRole="student"
                        until={until}
                        excludeIds={
                          instructorUuid ? [instructorUuid] : undefined
                        }
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl
                    render={
                      <Textarea
                        placeholder="Skills covered, conditions, anything worth remembering..."
                        className="min-h-[80px]"
                        {...field}
                        value={field.value ?? ""}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormApiError error={apiError} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <DialogSubmitButton isEdit={isEdit} createLabel="Create course" />
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
