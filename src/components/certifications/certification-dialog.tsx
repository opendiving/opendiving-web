"use client";

import { useCallback, useRef, useState } from "react";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { FormApiError } from "@/components/ui/form-api-error";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import {
  certificationSchema,
  CertificationInput,
} from "@/lib/validations/certification";
import {
  certificationsAPI,
  Certification,
  CertificationAgency,
  CertificationSide,
  CERTIFICATION_AGENCIES,
  CERTIFICATION_SIDE_LABELS,
  DEFAULT_CERTIFICATION_AGENCY,
  certificationAgencyLabel,
} from "@/lib/api/certifications";
import {
  applyCertificationCardEdits,
  type CertificationCardEdits,
} from "@/lib/certification-card-edits";
import type { Course } from "@/lib/api/courses";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CourseCombobox } from "@/components/courses/course-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/use-toast";
import { CertificationCardFiles } from "./certification-card-files";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";

// The certification fields a linked course can fill in, in the shape the form
// holds them: `null` and absent both arrive as `""`, which is this form's "not
// set" everywhere else.
//
// `name` and `notes` are deliberately not among them. A course name ("TDI
// Advanced Nitrox + Decompression Procedures") is not the level printed on a
// card, and one course can issue two differently-named cards; a course's notes
// describe the training, a card's describe the card. Both would be
// plausible-but-wrong values saved without being read - and `name` is the
// required, identity-bearing field, so an empty box is what makes the diver
// look at their card.
interface CertificationFieldValues {
  agency: CertificationAgency;
  agency_other: string;
  training_center: string;
  instructor_name: string;
  instructor_number: string;
}

// The same five as a course holds them. A course need not name an agency and a
// certification must, so that half is nullable here - and a course without one
// contributes nothing to the pair rather than emptying the required field.
type CourseFieldValues = Omit<CertificationFieldValues, "agency"> & {
  agency: CertificationAgency | null;
};

// What a course puts in those fields.
function courseFieldValues(course: Course): CourseFieldValues {
  return {
    agency: course.agency ?? null,
    agency_other: course.agency_other ?? "",
    training_center: course.training_center ?? "",
    instructor_name: course.instructor_name ?? "",
    instructor_number: course.instructor_number ?? "",
  };
}

// A prefill is not the diver's own edit, so it must not make the form read as
// dirty - nothing here gates on that today, and an unsaved-changes guard added
// later would otherwise fire on a form nobody typed into.
const AUTOFILL = { shouldDirty: false } as const;

interface CertificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pass an existing certification to edit it; omit to create a new one.
  certification?: Certification | null;
  // Opens a *create* dialog already linked to this course and prefilled from
  // it - how the course page's sidebar "Add a certification" hands it over.
  // Ignored alongside `certification`: editing a card is never a prefill.
  initialCourse?: Course;
  onSaved: (certification: Certification) => void;
}

// Create/edit dialog for a certification: its details and its card images, in one
// form and one Save.
//
// The images used to be a second dialog reached from a second button, because the
// API takes them on `PUT /certification/{uuid}/file/{side}` and a card being
// created has no uuid yet. That is still true, and is now handled by ordering
// rather than by a separate step - the details save first, then
// `applyCertificationCardEdits` sends whatever the diver picked or struck off. The
// visible half of the change is that Cancel now leaves the stored cards alone.
//
// A dialog rather than `new`/`edit` pages, following the gear precedent: these
// are a handful of fields typed off a card the diver is holding, not a
// multi-section form like a dive.
export function CertificationDialog({
  open,
  onOpenChange,
  certification,
  initialCourse,
  onSaved,
}: CertificationDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useDialogApiError(open);
  // What saving will do to each side's stored image, collected but not sent - see
  // `CertificationCardFiles`.
  const [cardEdits, setCardEdits] = useState<CertificationCardEdits>({});
  const isEdit = !!certification;

  const form = useForm<CertificationInput>({
    resolver: zodResolver(certificationSchema),
    defaultValues: {
      agency: DEFAULT_CERTIFICATION_AGENCY,
      agency_other: "",
      name: "",
      certification_number: "",
      certified_on: "",
      expires_on: "",
      instructor_name: "",
      instructor_number: "",
      training_center: "",
      notes: "",
      course_uuid: null,
    },
  });

  // `agency_other` is only shown - and only accepted by the API - for "other".
  // `useWatch` rather than `form.watch()`: the latter returns a fresh function
  // every render that can't be memoized, which the react-hooks lint rules reject.
  const agency = useWatch({ control: form.control, name: "agency" });

  // What this dialog last put in the five prefillable fields itself: the values
  // it opened with, and then whatever each course selection wrote. A field still
  // holding that value is one nobody has typed into, so the next course may
  // replace it; anything else is the diver's own and is never overwritten.
  //
  // Deliberately *not* react-hook-form's `dirtyFields`, which is the obvious
  // mechanism and does not survive contact with this form - see DECISIONS.md,
  // "A silently prefilled field is not a clean field".
  const autofilledRef = useRef<CertificationFieldValues>({
    agency: DEFAULT_CERTIFICATION_AGENCY,
    agency_other: "",
    training_center: "",
    instructor_name: "",
    instructor_number: "",
  });

  // Reload the form whenever the dialog opens, so it shows the certification
  // being edited rather than whatever the previous invocation left behind.
  const { reset, setValue, getValues } = form;
  useEffectOnChange(() => {
    if (!open) return;
    // A create dialog opened from a course page starts on that course, with its
    // fields already filled in. An edit dialog ignores it outright: its values
    // are a pure function of the card being edited.
    const seed = certification ? undefined : initialCourse;
    const from: CourseFieldValues = seed
      ? courseFieldValues(seed)
      : {
          agency: certification?.agency ?? DEFAULT_CERTIFICATION_AGENCY,
          agency_other: certification?.agency_other ?? "",
          training_center: certification?.training_center ?? "",
          instructor_name: certification?.instructor_name ?? "",
          instructor_number: certification?.instructor_number ?? "",
        };
    // A certification's agency is required, so a seed course that names none
    // hands over no pair and the form opens on its own default - this is the
    // one path that could otherwise open with a required field unset.
    const opening: CertificationFieldValues = {
      ...from,
      agency: from.agency ?? DEFAULT_CERTIFICATION_AGENCY,
      agency_other: from.agency ? from.agency_other : "",
    };
    autofilledRef.current = { ...opening };
    // Reopening the dialog must not carry a previous invocation's picked image
    // onto whichever card is being edited now.
    setCardEdits({});

    reset({
      ...opening,
      name: certification?.name ?? "",
      certification_number: certification?.certification_number ?? "",
      certified_on: certification?.certified_on ?? "",
      expires_on: certification?.expires_on ?? "",
      notes: certification?.notes ?? "",
      course_uuid: certification?.course_uuid ?? seed?.uuid ?? null,
    });
    // Same deliberate reset-on-open pattern as `gear-item-dialog.tsx`; clearing a
    // stale error when the dialog reopens is exactly the "sync to a prop change"
    // case this rule can't distinguish from a cascading render.
  }, [open, certification, initialCourse, reset]);

  // Picking a course copies its agency, training center and instructor across,
  // so the diver types them once rather than twice. Create only: the edit dialog
  // seeds itself from the stored card, which would make every settled field look
  // untouched and hand the whole card over to whichever course was picked.
  // Relinking on edit corrects the link, not the card.
  const prefillFromCourse = useCallback(
    (course: Course) => {
      if (isEdit) return;
      const autofilled = autofilledRef.current;
      const next = courseFieldValues(course);

      // The agency pair is considered together and written together: the API
      // rejects a named agency carrying an `agency_other`, and "other" without
      // one. A course that names no agency has no pair to hand over, so both
      // halves are left as they stand - blanking them would empty a required
      // field on a value the diver never chose.
      if (next.agency) {
        if (getValues("agency") === autofilled.agency) {
          setValue("agency", next.agency, AUTOFILL);
          autofilled.agency = next.agency;
        }
        if ((getValues("agency_other") ?? "") === autofilled.agency_other) {
          setValue("agency_other", next.agency_other, AUTOFILL);
          autofilled.agency_other = next.agency_other;
        }
      }
      if ((getValues("training_center") ?? "") === autofilled.training_center) {
        setValue("training_center", next.training_center, AUTOFILL);
        autofilled.training_center = next.training_center;
      }
      if ((getValues("instructor_name") ?? "") === autofilled.instructor_name) {
        setValue("instructor_name", next.instructor_name, AUTOFILL);
        autofilled.instructor_name = next.instructor_name;
      }
      if (
        (getValues("instructor_number") ?? "") === autofilled.instructor_number
      ) {
        setValue("instructor_number", next.instructor_number, AUTOFILL);
        autofilled.instructor_number = next.instructor_number;
      }
    },
    [isEdit, getValues, setValue],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  // The card images, once the details are safely stored. This is the step the API
  // shape forces: a card being created has no uuid until `createCertification`
  // resolves, and `PUT .../file/{side}` needs one.
  //
  // A failed image does not fail the save. The details are already written, and
  // making the diver fill the form in again to retry an upload costs more than the
  // picture does - the dive form's attach step reached the same answer. Each
  // failure gets its own toast naming the side.
  //
  // The returned certification is re-read whenever anything was sent, including
  // after a partial failure: the embedded `files` metadata the list and the
  // check-in sheet render from is stale either way, and only the API knows which
  // sides actually landed.
  const saveCardImages = async (
    saved: Certification,
  ): Promise<Certification> => {
    if (Object.keys(cardEdits).length === 0) return saved;

    const failures = await applyCertificationCardEdits(saved.uuid, cardEdits);
    for (const { side, error } of failures) {
      console.error(`Failed to save the ${side} card image:`, error);
      toast({
        title: `Saved, but the ${CERTIFICATION_SIDE_LABELS[
          side as CertificationSide
        ].toLowerCase()} image did not`,
        description: getApiErrorMessage(error, "Try picking the image again."),
        variant: "destructive",
      });
    }

    try {
      return await certificationsAPI.getCertification(saved.uuid);
    } catch (error) {
      // Non-fatal: the card itself is saved, and the list re-reads on its next
      // load. Returning what we have keeps the row on screen rather than
      // unwinding a save that succeeded.
      console.error("Failed to re-read the saved certification:", error);
      return saved;
    }
  };

  const onSubmit = async (data: CertificationInput) => {
    setApiError(null);
    try {
      setIsSubmitting(true);

      // "" is the form's "not set" state for every optional field. On update they
      // go as an explicit null so clearing one actually clears it rather than
      // being ignored as an omitted key; on create they are simply left off.
      //
      // `agency_other` is the exception: the API rejects a non-null value unless
      // the agency is "other", so switching away from "other" must send null
      // rather than the stale name still sitting in the form state.
      const shared = {
        agency: data.agency as CertificationAgency,
        agency_other:
          data.agency === "other" ? data.agency_other || null : null,
        name: data.name,
        certification_number: data.certification_number || null,
        certified_on: data.certified_on || null,
        expires_on: data.expires_on || null,
        instructor_name: data.instructor_name || null,
        instructor_number: data.instructor_number || null,
        training_center: data.training_center || null,
        notes: data.notes || "",
        // The picker's own empty state is already `null` rather than `""`, so
        // this needs no mapping - but it is sent on every save either way, which
        // is what makes clearing it clear the link. There is no
        // `buildCertificationUpdate` helper to hold that rule instead: this
        // dialog shows every field and submits all of them.
        course_uuid: data.course_uuid ?? null,
      };

      let saved: Certification;
      if (certification) {
        await certificationsAPI.updateCertification(certification.uuid, shared);
        saved = { ...certification, ...shared };
      } else {
        saved = await certificationsAPI.createCertification({ ...shared });
      }

      onSaved(await saveCardImages(saved));
      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isEdit ? "update" : "create"} certification. Please try again.`,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Wider than the default `max-w-lg`: the card slots below sit two to a row
          from `sm:` up, and two credit-card shapes in a `lg` dialog are thumbnails
          rather than a look at the picture being saved. */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Certification" : "New Certification"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            {/* First field on the form, above everything it fills in: source
                before targets, so the diver picks the course and watches the
                boxes below populate rather than typing them and wondering why
                they changed. It also means the inline "Add course..." flow
                prefills a form that is still empty. */}
            <FormField
              control={form.control}
              name="course_uuid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <FormControl>
                    {/* Opens its own `CourseDialog` on "Add course...", which
                        puts a dialog on top of this one. `dialogFormSubmit`
                        keeps that inner submit out of this form - see
                        DECISIONS.md. */}
                    <CourseCombobox
                      value={field.value}
                      onChange={field.onChange}
                      onCourseSelected={prefillFromCourse}
                    />
                  </FormControl>
                  <FormDescription>
                    The training this card came out of, if you logged it.
                    {/* Only true of a create dialog - relinking an existing
                        card changes the link and nothing else. */}
                    {!isEdit &&
                      " Picking one fills in the training center and instructor below, and the agency if the course names one."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="agency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agency *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Certification *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Advanced Open Water Diver"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="certification_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Certification number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="As printed on the card"
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
                name="certified_on"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certified on</FormLabel>
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
                name="expires_on"
                render={({ field }) => (
                  <FormItem>
                    {/* Most recreational cards never expire; rescue, first-aid
                        and technical ones do. */}
                    <FormLabel>Expires on</FormLabel>
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
                      placeholder="Specialties covered, restrictions, anything worth remembering..."
                      className="min-h-[80px]"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Last, and the only part of this form not typed off the card in
                the diver's hand. A two-column block of pictures in the middle of
                a field stack breaks the rhythm of filling one in. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Card images</p>
              <CertificationCardFiles
                certification={certification}
                edits={cardEdits}
                onChange={setCardEdits}
                disabled={isSubmitting}
              />
            </div>

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
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create certification
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
