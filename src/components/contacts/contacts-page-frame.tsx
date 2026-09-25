"use client";

import { type ReactNode } from "react";
import { BookUser, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
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

export interface ContactsPageFrameProps {
  isLoading: boolean;
  totalCount: number;
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
  /** Opens the new-contact dialog. */
  onNew?: () => void;
}

const noop = () => {};

// The table's columns, which the placeholder rows count too.
const COLUMNS = 6;

// Everything /contacts draws before its rows exist, kept apart from the data render
// so the page's first render is this frame - the shape `SitesPageFrame` has. Every
// data-varying prop is optional, and the defaults are that first render.
export function ContactsPageFrame({
  isLoading,
  totalCount,
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
}: ContactsPageFrameProps) {
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed: isSearching || search.length > 0,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-2">
            The dive centers, schools, shops and places you stayed, kept once
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          New contact
        </Button>
      </div>

      <Card>
        <ListCardHeader title="Contact List" isEmpty={isEmptyList}>
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="total contact"
          />
          <ListSearch
            id="contact-search"
            label="Search contacts by name or city"
            toggleLabel="Search contacts"
            placeholder="Search by name or city..."
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
                No contacts match that name or city.
              </div>
            ) : (
              <EmptyState
                icon={BookUser}
                title="No contacts yet"
                description="Add the dive centers, shops and places you stay at once, and pick them from your dives, courses and trips."
                action={
                  <Button onClick={onNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first contact
                  </Button>
                }
              />
            )
          ) : (
            <Table aria-busy={rows.length === 0 || undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Website</TableHead>
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
            itemLabel="contacts"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
