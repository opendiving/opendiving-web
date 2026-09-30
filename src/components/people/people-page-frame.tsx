"use client";

import { type ReactNode } from "react";
import { Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { IndexPageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { ListSearch } from "@/components/ui/list-search";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";

export interface PeoplePageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  itemsPerPage: number;
  rows?: ReactNode[];
  /** What the search box holds. Empty on arrival. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Whether a search *term* is in effect, which is not what the box holds. */
  isSearching?: boolean;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-person dialog. */
  onNew?: () => void;
}

const noop = () => {};

// The table's columns, which the placeholder rows count too.
const COLUMNS = 6;

// Everything /people draws before its rows exist, kept apart from the data render so
// the page's first render is this frame - the shape `ContactsPageFrame` has. Every
// data-varying prop is optional, and the defaults are that first render.
export function PeoplePageFrame({
  isLoading,
  totalCount,
  isCountNarrowed = false,
  itemsPerPage,
  rows = [],
  search = "",
  onSearchChange = noop,
  isSearching = false,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
}: PeoplePageFrameProps) {
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed: isSearching || search.length > 0,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <IndexPageHeader
        className="mb-6"
        title="People"
        description="Your buddies, guides, instructors and the people who came along, kept once"
        action={
          <Button onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New person
          </Button>
        }
      />

      <Card>
        <ListCardHeader title="People List" isEmpty={isEmptyList}>
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="person"
            plural="people"
            total
            isNarrowed={isCountNarrowed}
          />
          <ListSearch
            id="person-search"
            label="Search people by name or username"
            toggleLabel="Search people"
            placeholder="Search by name or username..."
            value={search}
            onChange={onSearchChange}
          />
        </ListCardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            // A searched list with nothing in it keeps to one line and offers
            // nothing, as the other lists' do.
            isSearching ? (
              <div className="text-center py-12 text-muted-foreground">
                No people match that name or username.
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No people yet"
                description="Add the people you dive with once, and pick them from your dives, trips and courses."
                action={
                  <Button onClick={onNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first person
                  </Button>
                }
              />
            )
          ) : (
            <Table aria-busy={rows.length === 0 || undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Dives</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRowsSkeleton columns={COLUMNS} rows={itemsPerPage} />
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
            itemLabel="people"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
