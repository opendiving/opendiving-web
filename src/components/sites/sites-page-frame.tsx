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

export interface SitesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  rows?: ReactNode[];
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-site dialog. Absent in the fallback, which has none to open. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /sites draws before its rows exist, rendered by the page and by
// the route fallback alike so the two cannot describe the screen differently.
export function SitesPageFrame({
  isLoading,
  totalCount,
  itemsPerPage,
  rows = [],
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
}: SitesPageFrameProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dive Sites</h1>
          <p className="text-muted-foreground mt-2">
            Keep track of the dive sites you&apos;ve visited
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Dive Site
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center justify-between">
            <span>Dive Site List</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="total dive site"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                No dive sites yet. Add your first dive site to start tracking
                your favorite spots!
              </div>
              <Button onClick={onNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Dive Site
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRowsSkeleton columns={3} rows={itemsPerPage} />
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
            itemLabel="dive sites"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
