"use client";

import { useEffect, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import { courseSchema, CourseInput } from "@/lib/validations/course";
import {
  coursesAPI,
  Course,
  COURSE_STATUSES,
  DEFAULT_COURSE_STATUS,
} from "@/lib/api/courses";
import {
  CERTIFICATION_AGENCIES,
  certificationAgencyLabel,
} from "@/lib/api/certifications";
import { courseStatusLabel } from "@/lib/course";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

// The agency picker's "no agency" option. The form itself holds `null` for that
// state and the API is sent `null`; this string exists only because a Radix
// `SelectItem` may not carry `""`, which is how that component spells "nothing
// selected" - so the option needs a value of its own and it never leaves here.
const NO_AGENCY = "none";

interface CourseDialogProps {
  userId: string;
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
  userId,
  open,
  onOpenChange,
  course,
  onSaved,
}: CourseDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
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
      instructor_name: "",
      instructor_number: "",
      training_center: "",
      notes: "",
    },
  });

  // `agency_other` is only shown - and only accepted by the API - for "other".
  // `useWatch` rather than `form.watch()`, which returns a fresh function every
  // render that can't be memoized (see DECISIONS.md).
  const agency = useWatch({ control: form.control, name: "agency" });

  // Reload the form whenever the dialog opens, so it shows the course being
  // edited rather than whatever the previous invocation left behind.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: course?.name ?? "",
      agency: course?.agency ?? null,
      agency_other: course?.agency_other ?? "",
      status: course?.status ?? DEFAULT_COURSE_STATUS,
      start_date: course?.start_date ?? "",
      end_date: course?.end_date ?? "",
      instructor_name: course?.instructor_name ?? "",
      instructor_number: course?.instructor_number ?? "",
      training_center: course?.training_center ?? "",
      notes: course?.notes ?? "",
    });
    // Same deliberate reset-on-open pattern as `certification-dialog.tsx`;
    // clearing a stale value when the dialog reopens is exactly the "sync to a
    // prop change" case this rule can't distinguish from a cascading render.
  }, [open, course, reset]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  const onSubmit = async (data: CourseInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

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
        name: data.name,
        agency: data.agency,
        agency_other:
          data.agency === "other" ? data.agency_other || null : null,
        status: data.status,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        instructor_name: data.instructor_name || null,
        instructor_number: data.instructor_number || null,
        training_center: data.training_center || null,
        notes: data.notes || "",
      };

      if (course) {
        // The API answers a PATCH with a status message only, so the updated
        // course is assembled here for the caller.
        await coursesAPI.updateCourse(course.uuid, shared);
        onSaved({ ...course, ...shared });
      } else {
        const created = await coursesAPI.createCourse({
          user_uuid: userId,
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
    } finally {
      setIsSubmitting(false);
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
                  <FormControl>
                    <Input
                      placeholder="e.g. Advanced Nitrox + Decompression Procedures"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="agency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency</FormLabel>
                    <Select
                      value={field.value ?? NO_AGENCY}
                      onValueChange={(value) =>
                        field.onChange(value === NO_AGENCY ? null : value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {/* First, because it is what the form opens on: a
                            course run by a private instructor has no agency,
                            and the state has to be pickable again after one has
                            been chosen. */}
                        <SelectItem value={NO_AGENCY}>No agency</SelectItem>
                        {CERTIFICATION_AGENCIES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {certificationAgencyLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COURSE_STATUSES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {courseStatusLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {agency === "other" && (
              <FormField
                control={form.control}
                name="agency_other"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. FFESSM"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    {/* Neither date is required, unlike a trip's start date: a
                        course that is only booked has no dates yet. */}
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="training_center"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Training center</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Blue Ocean, Koh Tao"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="instructor_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructor</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructor_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructor number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Skills covered, conditions, anything worth remembering..."
                      className="min-h-[80px]"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isEdit ? "Saving..." : "Creating..."}
                  </>
                ) : isEdit ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Course
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
