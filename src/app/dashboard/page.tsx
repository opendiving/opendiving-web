"use client";

import { useAuth } from "@/contexts/AuthContext";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { RecentTripsCard } from "@/components/dives/recent-trips-card";
import { diveStatsAPI, UserDiveStats } from "@/lib/api/dive-stats";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  MapPin,
  Fish,
  Calendar,
  Clock,
  Plus,
  TrendingUp,
  Activity,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserDiveStats | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        const data = await diveStatsAPI.getDiveStats(user.uuid);
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch dive stats:", error);
      }
    };

    fetchStats();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Welcome back, {user.name}! 🤿
          </h2>
          <p className="text-muted-foreground">
            Track your underwater adventures and connect with the diving
            community
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Dives</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.total_dives ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Start logging your dives!
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Max Depth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.max_depth ?? 0}m</div>
              <p className="text-xs text-muted-foreground">Personal best</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatDurationHoursMinutes(stats?.total_time ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">Underwater time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Species Seen
              </CardTitle>
              <Fish className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.species_seen ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Marine life species
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Dives & Trips */}
          <div className="lg:col-span-2 space-y-6">
            <RecentDivesCard userId={user.uuid} />
            <RecentTripsCard userId={user.uuid} />
          </div>

          {/* Quick Actions & Upcoming */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common diving activities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" asChild>
                  <Link href="/dives/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Log New Dive
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <MapPin className="h-4 w-4 mr-2" />
                  Find Dive Sites
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-2" />
                  Find Dive Buddy
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-2" />
                  Plan Trip
                </Button>
              </CardContent>
            </Card>

            {/* Getting Started */}
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  Complete your profile to get the most out of OpenDiving
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-blue-900 dark:text-blue-300">
                          Complete Profile
                        </h5>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Add your certification details
                        </p>
                      </div>
                      <Badge className="bg-blue-600">0/3</Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-900">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-green-900 dark:text-green-300">
                          Log First Dive
                        </h5>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Start tracking your adventures
                        </p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-orange-50 dark:bg-orange-950/40 rounded-lg border border-orange-200 dark:border-orange-900">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-orange-900 dark:text-orange-300">
                          Join Community
                        </h5>
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          Connect with other divers
                        </p>
                      </div>
                      <Badge variant="secondary">Optional</Badge>
                    </div>
                  </div>
                </div>

                <Button variant="ghost" className="w-full mt-4 text-sm">
                  View Profile Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
