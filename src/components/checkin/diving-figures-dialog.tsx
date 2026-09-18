"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Printer, RotateCcw } from "lucide-react";

import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { useUnits } from "@/hooks/useUnits";
import { type DivingFigures } from "@/lib/checkin";
import { unitLabel } from "@/lib/units";
import { dialogFormSubmit } from "@/lib/dialog-form";
import {
  divingFiguresFromForm,
  divingFiguresSchema,
  divingFiguresToForm,
  type DivingFiguresInput,
} from "@/lib/validations/checkin";
import { UnitNumberInput } from "@/components/unit-number-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

export interface DivingFiguresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the log itself says - where a fresh dialog opens, and what "Use logged figures" returns to. */
  logged: DivingFigures;
  /** The diver's correction, or null while the summary is printing the log's own figures. */
  corrected: DivingFigures | null;
  /** Emits a correction, or null to go back to the log's figures. */
  onChange: (figures: DivingFigures | null) => void;
}

/**
 * Corrects the three diving figures for the summary about to be printed, and for
 * nothing else.
 *
 * Deliberately not a save. A diver's logged dives are the ones they entered here, and
 * a career predating the app - or a fortnight logged on paper - makes the honest
 * number one this app cannot know. Storing the correction would then need it
 * reconciled against every dive logged afterwards, a running offset nobody can keep
 * true; a figure typed once, for one desk, needs no reconciliation at all. Reloading
 * the page brings the log's own figures back, which is the right default for the next
 * check-in.
 */
export function DivingFiguresDialog({
  open,
  onOpenChange,
  logged,
  corrected,
  onChange,
}: DivingFiguresDialogProps) {
  const units = useUnits();

  const form = useForm<DivingFiguresInput>({
    resolver: zodResolver(divingFiguresSchema),
    defaultValues: divingFiguresToForm(corrected ?? logged),
  });

  // Reload on open, so the dialog shows what the summary is printing rather than
  // whatever the previous invocation left behind - the same reset-on-open as every
  // create/edit dialog in the app, and on the same hook, so a route kept mounted
  // under `Activity` cannot blank a dialog the diver left open.
  const { reset } = form;
  useEffectOnChange(() => {
    if (open) reset(divingFiguresToForm(corrected ?? logged));
  }, [open, corrected, logged, reset]);

  const onSubmit = (data: DivingFiguresInput) => {
    onChange(divingFiguresFromForm(data));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Diving</DialogTitle>
          <DialogDescription>
            What your log holds, which may not be everything you have dived.
            Corrections here print on this summary only &mdash; nothing is saved
            to your log, and reloading the page brings the logged figures back.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="total_dives"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dives logged</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(event) => {
                        const typed = parseInt(event.target.value, 10);
                        field.onChange(Number.isNaN(typed) ? null : typed);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="max_depth"
              render={({ field }) => (
                <FormItem>
                  {/* The unit in the label, as every other depth box in the app
                      writes it: the number is the diver's own system and nothing
                      else on the row says which. */}
                  <FormLabel>Max depth ({unitLabel("depth", units)})</FormLabel>
                  <FormControl>
                    {/* Shows and takes the diver's own units while the value
                        behind it stays metric, like every other depth box. */}
                    <UnitNumberInput
                      dimension="depth"
                      units={units}
                      value={field.value}
                      onChange={field.onChange}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="last_dive_on"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last dive</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              {/* Only once there is something to undo, and it closes the dialog
                  the way a save does: both answer the same question. */}
              {corrected && (
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => {
                    onChange(null);
                    onOpenChange(false);
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Use logged figures
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {/* Not "Save changes": nothing is saved, and a diver who read the
                  line above and then pressed Save would be right to expect it
                  waiting at the next desk. */}
              <Button type="submit">
                <Printer className="h-4 w-4 mr-2" />
                Use on this summary
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
