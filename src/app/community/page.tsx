"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ComingSoon } from "@/components/layout/coming-soon";
import { Users } from "lucide-react";

export default function CommunityPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <ComingSoon
      icon={Users}
      title="Community"
      description="Connect with divers worldwide, find dive buddies, and share your underwater experiences. This feature is currently in development."
    />
  );
}
