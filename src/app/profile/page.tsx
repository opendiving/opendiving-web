"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/layout/header";
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
  User,
  Mail,
  Calendar,
  Settings,
  MapPin,
  Waves,
  Fish,
  Clock,
  Award,
  Edit,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header currentPage="profile" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header currentPage="profile" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center space-x-6">
              <div className="bg-blue-100 rounded-full p-6">
                <User className="h-12 w-12 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {user.name}
                </h1>
                <p className="text-gray-600 text-lg">@{user.username}</p>
                <div className="flex items-center mt-2 text-gray-500">
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
                  <Waves className="h-5 w-5 mr-2 text-blue-600" />
                  Diving Statistics
                </CardTitle>
                <CardDescription>
                  Your diving achievements at a glance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">0</div>
                    <div className="text-sm text-gray-600">Total Dives</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">0m</div>
                    <div className="text-sm text-gray-600">Max Depth</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      0min
                    </div>
                    <div className="text-sm text-gray-600">Total Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">0</div>
                    <div className="text-sm text-gray-600">Species Seen</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Dives */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Fish className="h-5 w-5 mr-2 text-blue-600" />
                  Recent Dives
                </CardTitle>
                <CardDescription>
                  Your latest underwater adventures
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Waves className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-900 mb-2">
                    No dives logged yet
                  </h3>
                  <p className="text-gray-500 mb-6">
                    Start your diving journey by logging your first dive!
                  </p>
                  <Button>
                    <Waves className="h-4 w-4 mr-2" />
                    Log Your First Dive
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                  <span className="text-gray-600">Member since</span>
                  <div className="flex items-center text-sm text-gray-900">
                    <Calendar className="h-4 w-4 mr-1" />
                    Dec 2024
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Profile views</span>
                  <span className="text-sm text-gray-900">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Tier</span>
                  <Badge variant="secondary">Free</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Certifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Award className="h-5 w-5 mr-2 text-yellow-600" />
                  Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Award className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm mb-4">
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
                  <MapPin className="h-5 w-5 mr-2 text-red-600" />
                  Favorite Dive Sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm mb-4">
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
    </div>
  );
}
