"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Edit, Trash2, Plus, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function DiveSiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [diveSite, setDiveSite] = useState<DiveSite | null>(null);
  const [isLoadingDiveSite, setIsLoadingDiveSite] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const diveSiteId = parseInt(params.id as string);

  // Redirect to signin if not authenticated, but only once the auth check
  // has actually finished.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  // Fetch dive site details
  useEffect(() => {
    const fetchDiveSite = async () => {
      if (!user?.username || !diveSiteId) return;

      try {
        setIsLoadingDiveSite(true);
        const diveSiteData = await diveSitesAPI.getDiveSite(user.username, diveSiteId);
        setDiveSite(diveSiteData);
      } catch (error) {
        console.error('Failed to fetch dive site:', error);
        toast({
          title: "Error",
          description: "Failed to load dive site details. Please try again.",
          variant: "destructive",
        });
        router.push('/sites');
      } finally {
        setIsLoadingDiveSite(false);
      }
    };

    if (user?.username) {
      fetchDiveSite();
    }
  }, [user?.username, diveSiteId, toast, router]);

  // Handle dive site deletion
  const handleDeleteDiveSite = async () => {
    if (!user?.username || !diveSite?.id || !confirm('Are you sure you want to delete this dive site? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      await diveSitesAPI.deleteDiveSite(user.username, diveSite.id);

      toast({
        title: "Success",
        description: "Dive site deleted successfully.",
      });

      router.push('/sites');
    } catch (error) {
      console.error('Failed to delete dive site:', error);
      toast({
        title: "Error",
        description: "Failed to delete dive site. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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

  if (isLoadingDiveSite) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="sites" />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!diveSite) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header showDashboardActions={true} currentPage="sites" />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              Dive site not found.
            </div>
            <Button asChild>
              <Link href="/sites">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dive Sites
              </Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showDashboardActions={true} currentPage="sites" />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sites">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dive Sites
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{diveSite.name}</h1>
              <p className="text-muted-foreground mt-1">
                Added {formatDate(diveSite.created_at)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/sites/${diveSite.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDiveSite}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RecentDivesCard
              username={user?.username ?? ""}
              diveSiteId={diveSite.id}
              limit={100}
              title="Dives at this Site"
              description="All dives logged at this dive site"
              viewAllHref={null}
              emptyTitle="No dives logged at this site yet"
              emptyDescription="Log a dive and assign it to this dive site to see it here."
              newDiveHref={`/dives/new?dive_site_id=${diveSite.id}`}
              newDiveLabel="Log a Dive at this Site"
            />
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Dive Site Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Added on</div>
                  <div className="text-sm">{formatDate(diveSite.created_at)}</div>
                </div>
                <Button className="w-full" asChild>
                  <Link href={`/dives/new?dive_site_id=${diveSite.id}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Log a Dive at this Site
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
