"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { divesAPI, Dive, PaginatedDivesResponse } from "@/lib/api/dives";
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
import { Plus, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function DivesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [dives, setDives] = useState<Dive[]>([]);
  const [isLoadingDives, setIsLoadingDives] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch dives, then resolve any dive site names on the page that haven't
  // been loaded yet. At most one request per unique site per session.
  const fetchDives = useCallback(
    async (page: number = 1) => {
      if (!user) return;

      try {
        setIsLoadingDives(true);
        const response: PaginatedDivesResponse = await divesAPI.getDives(
          user.uuid,
          page,
          itemsPerPage,
        );

        setDives(response.data);
        setTotalCount(response.total_count);
        setHasMore(response.has_more);
        setCurrentPage(page);
      } catch (error) {
        console.error("Failed to fetch dives:", error);
        toast({
          title: "Error",
          description: "Failed to load dives. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingDives(false);
      }
    },
    [user, itemsPerPage, toast],
  );

  useEffect(() => {
    // Deliberate fetch-on-mount pattern (setIsLoadingDives(true) runs synchronously
    // before the network await). This is a known, contentious false-positive for
    // react-hooks/set-state-in-effect - see https://github.com/facebook/react/issues/34743.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) fetchDives();
  }, [user, fetchDives]);

  // Handle dive deletion
  const handleDeleteDive = async (diveId: string) => {
    if (!user || !confirm("Are you sure you want to delete this dive?")) return;

    try {
      setDeletingId(diveId);
      await divesAPI.deleteDive(diveId);

      toast({
        title: "Success",
        description: "Dive deleted successfully.",
      });

      // Refresh the list
      await fetchDives(currentPage);
    } catch (error) {
      console.error("Failed to delete dive:", error);
      toast({
        title: "Error",
        description: "Failed to delete dive. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

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
      <div className="min-h-screen bg-background">
        <Header showDashboardActions={true} currentPage="dives" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <div className="min-h-screen bg-background">
      <Header showDashboardActions={true} currentPage="dives" />

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

            {/* Pagination */}
            {totalCount > itemsPerPage && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, totalCount)} of{" "}
                  {totalCount} dives
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchDives(currentPage - 1)}
                    disabled={currentPage === 1 || isLoadingDives}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchDives(currentPage + 1)}
                    disabled={!hasMore || isLoadingDives}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
