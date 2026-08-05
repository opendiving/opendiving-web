"use client";

import { useCallback } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { divesAPI, Dive } from "@/lib/api/dives";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Plus, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

export default function DivesPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();

  const fetchDives = useCallback(
    (page: number, perPage: number) => {
      if (!user) return Promise.reject(new Error("Not authenticated"));
      return divesAPI.getDives(user.uuid, page, perPage);
    },
    [user],
  );

  const {
    items: dives,
    isLoading: isLoadingDives,
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage: fetchDivesPage,
    refetch,
  } = usePaginatedResource<Dive>(fetchDives, {
    enabled: !!user,
    errorMessage: "Failed to load dives. Please try again.",
  });

  const { deletingId, handleDelete: handleDeleteDive } = useDeleteResource(
    divesAPI.deleteDive,
    {
      confirmMessage: "Are you sure you want to delete this dive?",
      successMessage: "Dive deleted successfully.",
      errorMessage: "Failed to delete dive. Please try again.",
      onDeleted: refetch,
    },
  );

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // Format dive duration (given in seconds)
  const formatDuration = (durationSeconds: number) => {
    const totalMinutes = Math.round(durationSeconds / 60);

    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Dives</h1>
            <p className="text-muted-foreground mt-2">
              Manage and track your diving activities
            </p>
          </div>
          <Button asChild>
            <Link href="/dives/new">
              <Plus className="h-4 w-4 mr-2" />
              Log New Dive
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dive Log</span>
              <Badge variant="secondary">
                {totalCount} total dive{totalCount !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingDives && dives.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : dives.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  No dives logged yet. Start by adding your first dive!
                </div>
                <Button asChild>
                  <Link href="/dives/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Log Your First Dive
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Dive Site</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Max Depth</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dives.map((dive) => (
                      <TableRow key={dive.uuid}>
                        <TableCell className="font-medium">
                          #{dive.dive_number}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dives/${dive.uuid}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {formatDate(dive.start_time)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <DiveSitesLabel sites={dive.dive_sites} />
                        </TableCell>
                        <TableCell>{formatDuration(dive.duration)}</TableCell>
                        <TableCell>
                          {dive.max_depth ? `${dive.max_depth}m` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/dives/${dive.uuid}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/dives/${dive.uuid}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDive(dive.uuid)}
                              disabled={deletingId === dive.uuid}
                            >
                              {deletingId === dive.uuid ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <PaginationFooter
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              totalCount={totalCount}
              hasMore={hasMore}
              isLoading={isLoadingDives}
              itemLabel="dives"
              onPageChange={fetchDivesPage}
            />
          </CardContent>
        </Card>
    </div>
  );
}
