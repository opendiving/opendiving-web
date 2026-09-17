"use client";

import { type ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  /** Opens the new-card dialog. Absent in the fallback, which has none to open. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /certifications draws before its rows exist, rendered by the page
// and by the route fallback alike so the two cannot describe the screen
// differently.
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
          New Certification
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            as="h2"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span>Your Certifications</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="certification"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                No certifications yet. Add your c-cards so you always have them
                on hand at the dive shop.
              </div>
              <Button onClick={onNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Certification
              </Button>
            </div>
          ) : (
            <Table>
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
