"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  User,
  Mail,
  Calendar,
  Settings,
  MapPin,
  Waves,
  Award,
  Edit,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const [stats, setStats] = useState<UserDiveStats | null>(null);

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
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Profile Header */}
        <div className="bg-card rounded-lg shadow-sm p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center space-x-6">
              <UserAvatar
                email={user.email}
                name={user.name}
                size={96}
                className="h-24 w-24"
              />
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {user.name}
                </h1>
                <p className="text-muted-foreground text-lg">@{user.username}</p>
                <div className="flex items-center mt-2 text-muted-foreground">
                  <Mail className="h-4 w-4 mr-2" />
                  <span className="text-sm">{user.email}</span>
                </div>
              </div>
            </div>
            <div className="mt-6 md:mt-0">
              <Link href="/settings">
                <Button>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Diving Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Waves className="h-5 w-5 mr-2" />
                  Diving Statistics
                </CardTitle>
                <CardDescription>
                  Your diving achievements at a glance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {stats?.total_dives ?? 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Dives</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {stats?.max_depth ?? 0}m
                    </div>
                    <div className="text-sm text-muted-foreground">Max Depth</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {formatDurationHoursMinutes(stats?.total_time ?? 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {stats?.species_seen ?? 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Species Seen</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Dives */}
            <RecentDivesCard userId={user.uuid} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Account Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Account Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <div className="flex items-center text-sm text-foreground">
                    <Calendar className="h-4 w-4 mr-1" />
                    Dec 2024
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Profile views</span>
                  <span className="text-sm text-foreground">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tier</span>
                  <Badge variant="secondary">Free</Badge>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Avatar powered by{" "}
                    <a
                      href="https://gravatar.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80"
                    >
                      Gravatar
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Certifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Award className="h-5 w-5 mr-2" />
                  Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Award className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-4">
                    No certifications added yet
                  </p>
                  <Button variant="outline" size="sm">
                    Add Certification
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Favorite Dive Sites */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Favorite Dive Sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-4">
                    No favorite sites yet
                  </p>
                  <Button variant="outline" size="sm">
                    Explore Sites
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/settings">
                  <Button variant="outline" className="w-full justify-start">
                    <Settings className="h-4 w-4 mr-2" />
                    Account Settings
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-start">
                  <Waves className="h-4 w-4 mr-2" />
                  Log New Dive
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <MapPin className="h-4 w-4 mr-2" />
                  Find Dive Sites
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
