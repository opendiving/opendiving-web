"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Loader2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  certificationsAPI,
  type Certification,
} from "@/lib/api/certifications";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  scheduleFromDueEntry,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import type { Renewable } from "@/lib/certification";
import { INSURANCE_FIELDS } from "@/lib/validations/user-fields";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { RenewalsList } from "@/components/certifications/renewals-list";
import { GearServiceRecordDialog } from "@/components/gear/gear-service-record-dialog";
import {
  ServiceDueList,
  gearItemLabel,
} from "@/components/gear/service-due-list";
import { UserFieldsDialog } from "@/components/user/user-fields-dialog";
import { CHECK_IN_GROUP_HEADINGS } from "@/components/user/user-fields-form";

// A section's header bar, its rows, and a line under them when the read behind them
// failed. The failure is said out loud because the panel is opened to ask "is anything
// due?", and a silently empty one answers "no".
function Section({
  title,
  icon: Icon,
  failedMessage,
  children,
}: {
  title: string;
  icon: LucideIcon;
  // `null` when the read succeeded.
  failedMessage: string | null;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="border-t first:border-t-0">
      {/* Sticky, so a long list scrolls under the name of what it is. `z-20` clears
          the rows' title links, which are lifted over their row's button. */}
      <h2
        id={headingId}
        className="sticky top-0 z-20 flex items-center gap-2 border-b bg-popover px-4 py-3 font-semibold"
      >
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      <div className="space-y-3 p-4">
        {children}
        {failedMessage && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {failedMessage}
          </p>
        )}
      </div>
    </section>
  );
}

// The form a row opened, or `null` for none. Each is mounted only while it is open
// and outside the popover, which has closed by then.
type Editing =
  | { kind: "service"; entry: GearServiceDueEntry }
  | { kind: "certification"; certification: Certification }
  | { kind: "insurance" };

/**
 * The header's bell: what the diver has to act on, from any page, with a count
 * of it on the bell itself. A row opens the form that deals with it - the
 * service log, or whichever form holds the date that is running out - and its
 * title goes to the item's page.
 */
export function NotificationsMenu() {
  const { isLoaded, serviceDue, renewals, count, reload } = useNotifications();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Memoised because the dialog resets its form whenever this prop's identity changes:
  // a fresh view built during render would wipe half-typed notes on the next render.
  const loggingSchedule = useMemo(
    () =>
      editing?.kind === "service" ? scheduleFromDueEntry(editing.entry) : null,
    [editing],
  );

  const close = () => setOpen(false);
  const stopEditing = (isOpen: boolean) => !isOpen && setEditing(null);

  // Focus moves to the bell before a form opens, because a dialog hands focus back to
  // whatever held it at opening - and the row that opened it is gone with the popover
  // by the time the dialog closes.
  const handOff = () => {
    triggerRef.current?.focus();
    setOpen(false);
  };

  const logService = (entry: GearServiceDueEntry) => {
    handOff();
    setEditing({ kind: "service", entry });
  };

  const renew = (row: Renewable) => {
    handOff();
    if (row.kind === "insurance") {
      setEditing({ kind: "insurance" });
      return;
    }
    // The renewals read carries five fields of a card, and the dialog edits all of it.
    certificationsAPI.getCertification(row.key).then(
      (certification) => setEditing({ kind: "certification", certification }),
      (error) => {
        console.error("Failed to load the certification:", error);
        toast({
          title: "Couldn't open that certification",
          description: getApiErrorMessage(error, "Try again in a moment."),
          variant: "destructive",
        });
      },
    );
  };

  const hasService = serviceDue.rows.length > 0 || serviceDue.failed;
  const hasRenewals = renewals.rows.length > 0 || renewals.failed;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {/* The hint wraps the trigger rather than sitting inside it, the order Radix
            documents for two nested `asChild` slots - as the header's menus do. */}
        <IconTooltip
          label={count > 0 ? `Notifications (${count})` : "Notifications"}
        >
          <PopoverTrigger asChild>
            <Button
              ref={triggerRef}
              variant="ghost"
              size="sm"
              // The hamburger's narrow padding, for the same 320px header row.
              className="relative px-2 sm:px-3"
            >
              <Bell className="h-4 w-4" />
              {/* The count is in the trigger's name already, so the chip is the
                  sighted half of it and hidden from assistive tech. Capped at two
                  characters to stay a dot-sized chip. */}
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive-solid px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-background"
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </IconTooltip>
        <PopoverContent
          ref={panelRef}
          align="end"
          collisionPadding={16}
          aria-label="Notifications"
          // Radix focuses the first tabbable descendant, which here is the first
          // row's title link, ringed as though it had been asked for. The panel
          // itself holds focus instead; Tab reaches the rows.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panelRef.current?.focus();
          }}
          // A row's form takes focus from here; returning it to the bell as the
          // popover closes would pull it straight back out of the dialog.
          onCloseAutoFocus={(event) => {
            if (editing) event.preventDefault();
          }}
          className="max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
        >
          {!isLoaded ? (
            <div
              role="status"
              aria-label="Loading notifications"
              className="flex justify-center p-6"
            >
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasService && !hasRenewals ? (
            <div className="space-y-1 p-6 text-center">
              <p className="text-sm font-medium">
                Nothing needs your attention
              </p>
              <p className="text-xs text-muted-foreground">
                Gear due a service and anything about to expire show up here.
              </p>
            </div>
          ) : (
            <>
              {hasService && (
                <Section
                  title="Service Due"
                  icon={Wrench}
                  failedMessage={
                    serviceDue.failed
                      ? "Couldn't check your gear's service. Try again in a moment."
                      : null
                  }
                >
                  {serviceDue.rows.length > 0 && (
                    <ServiceDueList
                      entries={serviceDue.rows}
                      truncated={serviceDue.truncated}
                      onNavigate={close}
                      onLogService={logService}
                    />
                  )}
                </Section>
              )}
              {/* A failed certifications read can still leave the insurance row,
                  which comes from the account rather than from that request. */}
              {hasRenewals && (
                <Section
                  title="Renewals"
                  icon={BadgeCheck}
                  failedMessage={
                    renewals.failed
                      ? "Couldn't check your certifications. Try again in a moment."
                      : null
                  }
                >
                  {renewals.rows.length > 0 && (
                    <RenewalsList
                      renewals={renewals.rows}
                      truncated={renewals.truncated}
                      onNavigate={close}
                      onRenew={renew}
                    />
                  )}
                </Section>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>

      {editing?.kind === "service" && (
        <GearServiceRecordDialog
          gearItemUuid={editing.entry.gear_item_uuid}
          gearItemLabel={gearItemLabel(editing.entry)}
          open
          onOpenChange={stopEditing}
          schedule={loggingSchedule}
          // A logged service resets the schedule's due date, so the row this was opened
          // from usually leaves the list, and the count drops with it.
          onSaved={reload}
        />
      )}
      {editing?.kind === "certification" && (
        <CertificationDialog
          open
          onOpenChange={stopEditing}
          certification={editing.certification}
          onSaved={() => reload()}
        />
      )}
      {/* The check-in page's insurance form. Saving refreshes the signed-in user, which
          the insurance row is derived from, so nothing needs reading again. */}
      <UserFieldsDialog
        open={editing?.kind === "insurance"}
        onOpenChange={stopEditing}
        {...CHECK_IN_GROUP_HEADINGS.insurance}
        groups={[{ fields: [...INSURANCE_FIELDS] }]}
      />
    </>
  );
}
