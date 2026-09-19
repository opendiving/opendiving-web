"use client";

import { type ReactNode } from "react";
import { BadgeCheck, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";

export interface CertificationsPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  rows?: ReactNode[];
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-card dialog. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /certifications draws before its rows exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function CertificationsPageFrame({
  isLoading,
  totalCount,
  itemsPerPage,
  rows = [],
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
}: CertificationsPageFrameProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Certifications</h1>
          <p className="text-muted-foreground mt-2">
            Keep photos of your c-cards here, so they&apos;re on hand at the
            dive shop without digging out the plastic
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          New certification
        </Button>
      </div>

      <Card>
        <CardHeader className="items-start">
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="certification"
          />
        </CardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No certifications yet"
              description="Add your c-cards so you always have them on hand at the dive shop."
              action={
                <Button onClick={onNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first certification
                </Button>
              }
            />
          ) : (
            <Table
              // Busy on the outside, hidden on each placeholder row within - the
              // split `ListRowsSkeleton` documents, applied here because the rows
              // themselves are `aria-hidden` and would otherwise leave a reader
              // with a table that is silently empty rather than one that is
              // loading.
              aria-busy={rows.length === 0 || undefined}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Certification</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Certified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRowsSkeleton columns={6} rows={itemsPerPage} />
                )}
                {rows}
              </TableBody>
            </Table>
          )}

          <LoadMoreTrigger
            hasMore={hasMore}
            isLoading={isLoadingMore}
            hasFailed={loadFailed}
            loadedCount={rows.length}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            itemLabel="certifications"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
