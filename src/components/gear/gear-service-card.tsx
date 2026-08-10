"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Wrench,
  Pause,
  Play,
  ClipboardCheck,
} from "lucide-react";
import type { GearItem } from "@/lib/api/gear";
import {
  fetchAllServiceRecords,
  gearServiceAPI,
  serviceKindLabel,
  type GearServiceRecord,
  type GearServiceSchedule,
} from "@/lib/api/gear-service";
import { formatServiceDue, serviceStatus } from "@/lib/gear-service";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateOnly } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { useToast } from "@/components/ui/use-toast";
import { ServiceStatusBadge } from "@/components/gear/service-status-badge";
import { GearServiceScheduleDialog } from "@/components/gear/gear-service-schedule-dialog";
import { GearServiceRecordDialog } from "@/components/gear/gear-service-record-dialog";

interface GearServiceCardProps {
  userId: string;
  gearItem: GearItem;
  // Called after any write, so the page can refetch the item - its embedded `service`
  // summaries carry the due dates this card renders.
  onChanged: () => void;
}

// Service schedules and history for one gear item. Sits above the dive list on the gear
// detail page: service is the thing you can act on here, the dive list is reference.
export function GearServiceCard({
  userId,
  gearItem,
  onChanged,
}: GearServiceCardProps) {
  const { toast } = useToast();

  const [schedules, setSchedules] = useState<GearServiceSchedule[]>([]);
  const [records, setRecords] = useState<GearServiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  // `null` = closed, `undefined` = creating, an object = editing.
  const [editingSchedule, setEditingSchedule] = useState<
    GearServiceSchedule | null | undefined
  >(null);
  const [loggingFor, setLoggingFor] = useState<
    GearServiceSchedule | null | undefined
  >(null);
  const [editingRecord, setEditingRecord] = useState<GearServiceRecord | null>(
    null,
  );
  const [deletingSchedule, setDeletingSchedule] =
    useState<GearServiceSchedule | null>(null);
  const [deletingRecord, setDeletingRecord] =
    useState<GearServiceRecord | null>(null);

  const load = useCallback(async () => {
    const [schedulePage, allRecords] = await Promise.all([
      gearServiceAPI.getSchedules(userId, gearItem.uuid, 1, 100),
      fetchAllServiceRecords(userId, gearItem.uuid),
    ]);
    setSchedules(schedulePage.data);
    setRecords(allRecords);
  }, [userId, gearItem.uuid]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // Wrapped in an async function rather than called straight from the effect body,
    // matching the fetch effects on the gear/dive detail pages - a synchronous
    // `setState` in an effect body triggers a cascading render.
    const fetchService = async () => {
      try {
        setIsLoading(true);
        await load();
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "Error",
          description: getApiErrorMessage(
            error,
            "Failed to load service history. Please try again.",
          ),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchService();

    return () => {
      cancelled = true;
    };
  }, [userId, load, toast]);

  // Any write can move a due date, so both this card and the page's copy of the item
  // (which carries the embedded summaries) are refreshed.
  const refresh = useCallback(() => {
    load().catch((error) => console.error("Failed to reload service:", error));
    onChanged();
  }, [load, onChanged]);

  const withBusy = async (
    uuid: string,
    action: () => Promise<unknown>,
    failure: string,
  ) => {
    try {
      setBusyUuid(uuid);
      await action();
      refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, failure),
        variant: "destructive",
      });
    } finally {
      setBusyUuid(null);
      setDeletingSchedule(null);
      setDeletingRecord(null);
    }
  };

  const toggleActive = (schedule: GearServiceSchedule) =>
    withBusy(
      schedule.uuid,
      () =>
        gearServiceAPI.updateSchedule(schedule.uuid, {
          is_active: !schedule.is_active,
        }),
      "Failed to update schedule. Please try again.",
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Service
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingSchedule(undefined)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Schedule
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <SectionSpinner />
        ) : (
          <>
            {schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No service schedule yet. Add one and you&apos;ll get a reminder
                before it&apos;s due — a regulator service, a cylinder&apos;s
                visual inspection and hydro, a computer battery.
              </p>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule) => {
                  const status = serviceStatus(schedule, gearItem.dive_count);
                  const isBusy = busyUuid === schedule.uuid;
                  return (
                    <div
                      key={schedule.uuid}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {serviceKindLabel(schedule.kind)}
                          {schedule.label && (
                            <span className="text-muted-foreground font-normal">
                              ({schedule.label})
                            </span>
                          )}
                          {!schedule.is_active && (
                            <Badge variant="outline">Paused</Badge>
                          )}
                        </div>
                        <ServiceStatusBadge
                          status={schedule.is_active ? status : null}
                          detail={
                            schedule.is_active
                              ? formatServiceDue(schedule, gearItem.dive_count)
                              : undefined
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {[
                            schedule.interval_months
                              ? `Every ${schedule.interval_months} months`
                              : null,
                            schedule.interval_dives
                              ? `every ${schedule.interval_dives} dives`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" or ")}
                          {schedule.last_service_on
                            ? ` · last done ${formatDateOnly(schedule.last_service_on)}`
                            : " · never serviced"}
                        </p>
                      </div>

                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Log service"
                          onClick={() => setLoggingFor(schedule)}
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={schedule.is_active ? "Pause" : "Resume"}
                          disabled={isBusy}
                          onClick={() => toggleActive(schedule)}
                        >
                          {schedule.is_active ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Edit"
                          onClick={() => setEditingSchedule(schedule)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete"
                          disabled={isBusy}
                          onClick={() => setDeletingSchedule(schedule)}
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Service history
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoggingFor(undefined)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Log Service
                </Button>
              </div>

              {records.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing logged yet. Recording a service resets its schedule
                  and keeps the receipt.
                </p>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => (
                    <div
                      key={record.uuid}
                      className="flex flex-wrap items-start justify-between gap-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {serviceKindLabel(record.kind)}
                          {record.label && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              ({record.label})
                            </span>
                          )}
                          <span className="text-muted-foreground font-normal">
                            {" · "}
                            {formatDateOnly(record.serviced_on)}
                          </span>
                        </div>
                        {record.performed_by && (
                          <div className="text-muted-foreground">
                            {record.performed_by}
                          </div>
                        )}
                        {record.notes && (
                          <p className="whitespace-pre-wrap text-muted-foreground">
                            {record.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Edit"
                          onClick={() => setEditingRecord(record)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete"
                          disabled={busyUuid === record.uuid}
                          onClick={() => setDeletingRecord(record)}
                        >
                          {busyUuid === record.uuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      <GearServiceScheduleDialog
        gearItem={gearItem}
        open={editingSchedule !== null}
        onOpenChange={(open) => !open && setEditingSchedule(null)}
        schedule={editingSchedule}
        onSaved={refresh}
      />

      <GearServiceRecordDialog
        gearItem={gearItem}
        open={loggingFor !== null}
        onOpenChange={(open) => !open && setLoggingFor(null)}
        schedule={loggingFor}
        onSaved={refresh}
      />

      <GearServiceRecordDialog
        gearItem={gearItem}
        open={editingRecord !== null}
        onOpenChange={(open) => !open && setEditingRecord(null)}
        record={editingRecord}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deletingSchedule !== null}
        onOpenChange={(open) => !open && setDeletingSchedule(null)}
        title="Delete service schedule"
        description="This stops the reminder. The services you've already logged stay in the history."
        confirmText="Delete"
        isLoading={busyUuid === deletingSchedule?.uuid}
        onConfirm={() => {
          if (!deletingSchedule) return;
          void withBusy(
            deletingSchedule.uuid,
            () => gearServiceAPI.deleteSchedule(deletingSchedule.uuid),
            "Failed to delete schedule. Please try again.",
          );
        }}
      />

      <ConfirmDialog
        open={deletingRecord !== null}
        onOpenChange={(open) => !open && setDeletingRecord(null)}
        title="Delete service record"
        description="The schedule falls back to the service before this one, or to its in-service date if this was the only one."
        confirmText="Delete"
        isLoading={busyUuid === deletingRecord?.uuid}
        onConfirm={() => {
          if (!deletingRecord) return;
          void withBusy(
            deletingRecord.uuid,
            () => gearServiceAPI.deleteRecord(deletingRecord.uuid),
            "Failed to delete service record. Please try again.",
          );
        }}
      />
    </Card>
  );
}
