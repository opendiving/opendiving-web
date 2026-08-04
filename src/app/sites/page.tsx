"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  diveSitesAPI,
  DiveSite,
  PaginatedDiveSitesResponse,
} from "@/lib/api/dive-sites";
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

export default function SitesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [isLoadingDiveSites, setIsLoadingDiveSites] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch dive sites
  const fetchDiveSites = async (page: number = 1) => {
    if (!user?.username) return;

    try {
      setIsLoadingDiveSites(true);
      const response: PaginatedDiveSitesResponse =
        await diveSitesAPI.getDiveSites(user.username, page, itemsPerPage);

      setDiveSites(response.data);
      setTotalCount(response.total_count);
      setHasMore(response.has_more);
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to fetch dive sites:", error);
      toast({
        title: "Error",
        description: "Failed to load dive sites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDiveSites(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      fetchDiveSites();
    }
  }, [user?.username]);

  // Handle dive site deletion
  const handleDeleteDiveSite = async (diveSiteId: number) => {
    if (
      !user?.username ||
      !confirm("Are you sure you want to delete this dive site?")
    )
      return;

    try {
      setDeletingId(diveSiteId);
      await diveSitesAPI.deleteDiveSite(user.username, diveSiteId);

      toast({
        title: "Success",
        description: "Dive site deleted successfully.",
      });

      // Refresh the list
      await fetchDiveSites(currentPage);
    } catch (error) {
      console.error("Failed to delete dive site:", error);
      toast({
        title: "Error",
        description: "Failed to delete dive site. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="sites" />
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
    <div className="min-h-screen bg-gray-50">
      <Header showDashboardActions={true} currentPage="sites" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Dive Sites</h1>
            <p className="text-muted-foreground mt-2">
              Keep track of the dive sites you&apos;ve visited
            </p>
          </div>
          <Button asChild>
            <Link href="/sites/new">
              <Plus className="h-4 w-4 mr-2" />
              New Dive Site
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dive Site List</span>
              <Badge variant="secondary">
                {totalCount} total dive site{totalCount !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingDiveSites && diveSites.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : diveSites.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  No dive sites yet. Add your first dive site to start tracking
                  your favorite spots!
                </div>
                <Button asChild>
                  <Link href="/sites/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Dive Site
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diveSites.map((diveSite) => (
                      <TableRow key={diveSite.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/sites/${diveSite.id}`}
                            className="hover:underline"
                          >
                            {diveSite.name}
                          </Link>
                        </TableCell>
                        <TableCell>{diveSite.location || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/sites/${diveSite.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/sites/${diveSite.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDiveSite(diveSite.id)}
                              disabled={deletingId === diveSite.id}
                            >
                              {deletingId === diveSite.id ? (
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
                  {totalCount} dive sites
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchDiveSites(currentPage - 1)}
                    disabled={currentPage === 1 || isLoadingDiveSites}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchDiveSites(currentPage + 1)}
                    disabled={!hasMore || isLoadingDiveSites}
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
