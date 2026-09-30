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
  scheduleFromDueEntry,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IconTooltip } from "@/components/ui/tooltip";
import { GearServiceRecordDialog } from "@/components/gear/gear-service-record-dialog";
import {
  ServiceDueList,
  gearItemLabel,
} from "@/components/gear/service-due-list";
import { RenewalsList } from "@/components/certifications/renewals-list";

// A heading, its rows, and a line under them when the read behind them failed. The
// failure is said out loud because the panel is opened to ask "is anything due?", and
// a silently empty one answers "no".
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
    <section aria-labelledby={headingId} className="space-y-3">
      <h3
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
      {failedMessage && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {failedMessage}
        </p>
      )}
    </section>
  );
}

/**
 * The header's bell: what the diver has to act on, from any page, with a count
 * of it on the bell itself.
 *
 * A popover rather than a menu, because a service row holds two controls - the
 * link to the item and the button that logs its service - and a menu item
 * cannot contain a second interactive element.
 */
export function NotificationsMenu() {
  const { isLoaded, serviceDue, renewals, count, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  // The row whose service is being logged, or `null` for "no dialog". Lives here rather
  // than in the list, which unmounts with the popover as the dialog opens.
  const [loggingFor, setLoggingFor] = useState<GearServiceDueEntry | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Memoised because the dialog resets its form whenever this prop's identity changes:
  // a fresh view built during render would wipe half-typed notes on the next render.
  const loggingSchedule = useMemo(
    () => (loggingFor ? scheduleFromDueEntry(loggingFor) : null),
    [loggingFor],
  );

  const close = () => setOpen(false);

  const logService = (entry: GearServiceDueEntry) => {
    // Focus moves to the bell before the dialog opens, because the dialog hands focus
    // back to whatever held it at opening - and the row's own button is gone with the
    // popover by the time the dialog closes.
    triggerRef.current?.focus();
    setOpen(false);
    setLoggingFor(entry);
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
          aria-labelledby={headingId}
          // Radix focuses the first tabbable descendant, which here is the first
          // row's log-service button, ringed and hinted as though it had been asked
          // for. The panel itself holds focus instead; Tab reaches the rows.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panelRef.current?.focus();
          }}
          // The dialog a service row opens takes focus from here; returning it to the
          // bell as the popover closes would pull it straight back out of the dialog.
          onCloseAutoFocus={(event) => {
            if (loggingFor) event.preventDefault();
          }}
          className="flex max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-2rem)] flex-col p-0"
        >
          <h2 id={headingId} className="border-b px-4 py-3 font-semibold">
            Notifications
          </h2>
          <div className="space-y-5 overflow-y-auto p-4">
            {!isLoaded ? (
              <div
                role="status"
                aria-label="Loading notifications"
                className="flex justify-center py-4"
              >
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !hasService && !hasRenewals ? (
              <div className="space-y-1 py-2 text-center">
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
                      />
                    )}
                  </Section>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Mounted only while a row is being logged: there is no subject for it until a
          row is picked. Outside the popover, which has closed by then. */}
      {loggingFor && (
        <GearServiceRecordDialog
          gearItemUuid={loggingFor.gear_item_uuid}
          gearItemLabel={gearItemLabel(loggingFor)}
          open
          onOpenChange={(isOpen) => !isOpen && setLoggingFor(null)}
          schedule={loggingSchedule}
          // A logged service resets the schedule's due date, so the row this was opened
          // from usually leaves the list, and the count drops with it.
          onSaved={reload}
        />
      )}
    </>
  );
}
