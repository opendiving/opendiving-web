"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { formatDateTime } from "@/lib/date-time";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { NotFoundState } from "@/components/ui/not-found-state";
import { Edit, Trash2, Plus, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

export default function DiveSiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { toast } = useToast();
  const [diveSite, setDiveSite] = useState<DiveSite | null>(null);
  const [isLoadingDiveSite, setIsLoadingDiveSite] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const diveSiteId = params.id as string;

  // Fetch dive site details
  useEffect(() => {
    const fetchDiveSite = async () => {
      if (!user || !diveSiteId) return;

      try {
        setIsLoadingDiveSite(true);
        const diveSiteData = await diveSitesAPI.getDiveSite(diveSiteId);
        setDiveSite(diveSiteData);
      } catch (error) {
        console.error("Failed to fetch dive site:", error);
        toast({
          title: "Error",
          description: "Failed to load dive site details. Please try again.",
          variant: "destructive",
        });
        router.push("/sites");
      } finally {
        setIsLoadingDiveSite(false);
      }
    };

    if (user) {
      fetchDiveSite();
    }
  }, [user, diveSiteId, toast, router]);

  // Handle dive site deletion
  const handleDeleteDiveSite = async () => {
    if (!user || !diveSite?.uuid) return;

    try {
      setIsDeleting(true);
      await diveSitesAPI.deleteDiveSite(diveSite.uuid);

      toast({
        title: "Success",
        description: "Dive site deleted successfully.",
      });

      router.push("/sites");
    } catch (error) {
      console.error("Failed to delete dive site:", error);
      toast({
        title: "Error",
        description: "Failed to delete dive site. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

  const formatDate = (dateString: string) =>
    formatDateTime(dateString, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

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

  if (isLoadingDiveSite) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SectionSpinner />
      </div>
    );
  }

  if (!diveSite) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NotFoundState
          message="Dive site not found."
          backHref="/sites"
          backLabel="Back to Dive Sites"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        backHref="/sites"
        backLabel="Back to Dive Sites"
        title={diveSite.name}
        subtitle={
          diveSite.location
            ? diveSite.location
            : `Added ${formatDate(diveSite.created_at)}`
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/sites/${diveSite.uuid}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Delete dive site"
        description="Are you sure you want to delete this dive site? This action cannot be undone."
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={handleDeleteDiveSite}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentDivesCard
            userId={user?.uuid ?? ""}
            diveSiteId={diveSite.uuid}
            limit={100}
            title="Dives at this Site"
            description="All dives logged at this dive site"
            viewAllHref={null}
            emptyTitle="No dives logged at this site yet"
            emptyDescription="Log a dive and assign it to this dive site to see it here."
            newDiveHref={`/dives/new?dive_site_uuid=${diveSite.uuid}`}
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
              {diveSite.location && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Location
                  </div>
                  <div className="text-sm">{diveSite.location}</div>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Added on
                </div>
                <div className="text-sm">{formatDate(diveSite.created_at)}</div>
              </div>
              <Button className="w-full" asChild>
                <Link href={`/dives/new?dive_site_uuid=${diveSite.uuid}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log a Dive at this Site
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
