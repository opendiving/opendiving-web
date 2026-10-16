"use client";

import { type ComponentType, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
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

/**
 * What a table list page's frame takes from its data. Every prop past the
 * first three is optional, and the defaults are the page's first render.
 */
export interface TableListFrameData {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  /** One `TableRow` per record, ending in its `RowActions`. */
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
  /** Opens the new-record dialog. */
  onNew?: () => void;
}

/** The words, icon and columns that make a table list page one record's. */
export interface TableListFrameCopy {
  title: string;
  description: string;
  /** The hero's button: `New person`. */
  newLabel: string;
  listTitle: string;
  /** The count's noun, and its plural where an `s` will not do. */
  noun: string;
  pluralNoun?: string;
  search: {
    id: string;
    label: string;
    toggleLabel: string;
    placeholder: string;
  };
  /** The one line a search that matches nothing gets. */
  noMatch: string;
  empty: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    description: string;
    action: string;
  };
  /** The data columns' headings; the actions column follows them. */
  columns: readonly string[];
}

const noop = () => {};

// Everything a searchable table list - /people, /contacts - draws before its rows
// exist, kept apart from the data render so the page's first render is this frame.
export function TableListFrame({
  copy,
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
}: TableListFrameData & { copy: TableListFrameCopy }) {
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed: isSearching || search.length > 0,
  });
  const pluralNoun = copy.pluralNoun ?? `${copy.noun}s`;

  return (
    <div>
      <IndexHero
        title={copy.title}
        description={copy.description}
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            {copy.newLabel}
          </Button>
        }
      />

      <div className={HERO_BODY}>
        <Card>
          <ListCardHeader title={copy.listTitle} isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label={copy.noun}
              plural={pluralNoun}
              total
              isNarrowed={isCountNarrowed}
            />
            <ListSearch
              {...copy.search}
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
                  {copy.noMatch}
                </div>
              ) : (
                <EmptyState
                  icon={copy.empty.icon}
                  title={copy.empty.title}
                  description={copy.empty.description}
                  action={
                    <Button onClick={onNew}>
                      <Plus className="h-4 w-4 mr-2" />
                      {copy.empty.action}
                    </Button>
                  }
                />
              )
            ) : (
              <Table aria-busy={rows.length === 0 || undefined}>
                <TableHeader>
                  <TableRow>
                    {copy.columns.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRowsSkeleton
                      columns={copy.columns.length + 1}
                      rows={itemsPerPage}
                    />
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
              itemLabel={pluralNoun}
              onLoadMore={onLoadMore}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
