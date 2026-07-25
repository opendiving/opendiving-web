"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { divesAPI, Dive, PaginatedDivesResponse } from "@/lib/api/dives";
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
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [dives, setDives] = useState<Dive[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      window.location.href = '/signin';
    }
  }, [isAuthenticated, isLoading]);

  // Fetch dives
  const fetchDives = async (page: number = 1) => {
    if (!user?.username) return;

    try {
      setIsLoading(true);
      const response: PaginatedDivesResponse = await divesAPI.getDives(
        user.username,
        page,
        itemsPerPage
      );

      setDives(response.data);
      setTotalCount(response.total_count);
      setHasMore(response.has_more);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to fetch dives:', error);
      toast({
        title: "Error",
        description: "Failed to load dives. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      fetchDives();
    }
  }, [user?.username]);

  // Handle dive deletion
  const handleDeleteDive = async (diveId: number) => {
    if (!user?.username || !confirm('Are you sure you want to delete this dive?')) return;

    try {
      setDeletingId(diveId);
      await divesAPI.deleteDive(user.username, diveId);

      toast({
        title: "Success",
        description: "Dive deleted successfully.",
      });

      // Refresh the list
      await fetchDives(currentPage);
    } catch (error) {
      console.error('Failed to delete dive:', error);
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
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Dives</h1>
          <p className="text-muted-foreground mt-2">
            Manage and track your diving activities
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/dives/new">
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
              {totalCount} total dive{totalCount !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && dives.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : dives.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                No dives logged yet. Start by adding your first dive!
              </div>
              <Button asChild>
                <Link href="/dashboard/dives/new">
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
                    <TableHead>Duration</TableHead>
                    <TableHead>Max Depth</TableHead>
                    <TableHead>Avg Depth</TableHead>
                    <TableHead>Temperature</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dives.map((dive) => (
                    <TableRow key={dive.id}>
                      <TableCell className="font-medium">
                        #{dive.dive_number}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {formatDate(dive.start_time)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            Started at {new Date(dive.start_time).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDuration(dive.duration)}
                      </TableCell>
                      <TableCell>
                        {dive.max_depth ? `${dive.max_depth}m` : '-'}
                      </TableCell>
                      <TableCell>
                        {dive.avg_depth ? `${dive.avg_depth}m` : '-'}
                      </TableCell>
                      <TableCell>
                        {dive.bottom_temperature ? `${dive.bottom_temperature}°C` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-32 truncate text-sm text-muted-foreground">
                          {dive.notes || 'No notes'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <Link href={`/dashboard/dives/${dive.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <Link href={`/dashboard/dives/${dive.id}/edit`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDive(dive.id)}
                            disabled={deletingId === dive.id}
                          >
                            {deletingId === dive.id ? (
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
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} dives
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDives(currentPage - 1)}
                  disabled={currentPage === 1 || isLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDives(currentPage + 1)}
                  disabled={!hasMore || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
