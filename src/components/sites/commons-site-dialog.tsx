"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDialogApiError } from "@/hooks/useDialogApiError";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { useUnits } from "@/hooks/useUnits";
import { diveSitesAPI, type DiveSite } from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";
import { dialogFormSubmit } from "@/lib/dialog-form";
import { tagsField } from "@/lib/validations/dive";
import { notesField } from "@/lib/validations/notes";
import { formatCoordinates } from "@/lib/validations/coordinates";
import { TagsMultiSelect } from "@/components/dives/tags-multi-select";
import { CommonsBadge, CommonsCredit } from "@/components/sites/commons-site";
import { diveSiteFacts } from "@/components/sites/dive-site-facts";
import { readBack } from "@/components/sites/dive-site-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogSubmitButton } from "@/components/ui/dialog-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormApiError } from "@/components/ui/form-api-error";
import { FactsLine } from "@/components/ui/icon-fact";
import { Textarea } from "@/components/ui/textarea";

const commonsSiteFormSchema = z.object({
  notes: notesField().optional(),
  tags: tagsField().optional(),
});

type CommonsSiteFormInput = z.input<typeof commonsSiteFormSchema>;

interface CommonsSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The Commons record: unsaved to save it, saved to edit what the diver holds on it.
  site: DiveSite | null;
  onSaved: (site: DiveSite) => void;
}

// The record as it stands for every account, on show and out of reach: a diver's
// own form is `DiveSiteDialog`, and none of these is theirs to write.
function CommonsSiteSummary({ site }: { site: DiveSite }) {
  const units = useUnits();
  const facts = diveSiteFacts(site, units);
  const coordinates = formatCoordinates(site.latitude, site.longitude);
  const otherNames = site.other_names ?? [];
  return (
    <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 font-medium">
        {site.name}
        <CommonsBadge />
      </div>
      {otherNames.length > 0 && (
        <p className="text-muted-foreground">{otherNames.join(", ")}</p>
      )}
      {facts.length > 0 && (
        <div className="text-xs">
          <FactsLine facts={facts} />
        </div>
      )}
      {coordinates && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {coordinates}
        </p>
      )}
      <CommonsCredit attribution={site.attribution} />
    </div>
  );
}

/**
 * What a diver writes on a Commons record, which is all they can: their notes and
 * their tags. A record they have not saved takes neither until they save it, so
 * for one of those this is the save, and the two can go in one request.
 */
export function CommonsSiteDialog({
  open,
  onOpenChange,
  site,
  onSaved,
}: CommonsSiteDialogProps) {
  const [apiError, setApiError, handleOpenChange] = useDialogApiError(
    open,
    onOpenChange,
  );
  const form = useForm<CommonsSiteFormInput>({
    resolver: zodResolver(commonsSiteFormSchema),
    defaultValues: { notes: "", tags: [] },
  });

  const { reset } = form;
  useEffectOnChange(() => {
    if (!open) return;
    reset({ notes: site?.notes ?? "", tags: site?.tags ?? [] });
  }, [open, site, reset]);

  const isSaved = !!site?.saved;

  const onSubmit = async ({ notes = "", tags = [] }: CommonsSiteFormInput) => {
    if (!site) return;
    setApiError(null);
    try {
      if (site.saved) {
        const update = { notes, tags };
        await diveSitesAPI.updateDiveSite(site.uuid, update);
        onSaved(await readBack(site, update));
      } else {
        onSaved(await diveSitesAPI.saveDiveSite(site.uuid, { notes, tags }));
      }
      onOpenChange(false);
    } catch (error) {
      setApiError(
        getApiErrorMessage(
          error,
          `Failed to ${isSaved ? "update" : "save"} dive site. Please try again.`,
        ),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSaved ? "Edit notes and tags" : "Save to your sites"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `dialogFormSubmit` for the reason `DiveSiteDialog` has it. */}
          <form
            onSubmit={dialogFormSubmit(form.handleSubmit(onSubmit))}
            className="space-y-4"
          >
            {site && <CommonsSiteSummary site={site} />}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl
                    render={
                      <Textarea
                        placeholder="Any notes about this dive site..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl
                    render={
                      <TagsMultiSelect
                        value={field.value ?? []}
                        onChange={field.onChange}
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
              <DialogSubmitButton
                isEdit={isSaved}
                createLabel="Save to your sites"
                creatingLabel="Saving..."
              />
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
