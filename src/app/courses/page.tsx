import type { Metadata } from "next";

import { CoursesPageContent } from "@/components/courses/courses-page-content";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <CoursesPageContent />;
}
