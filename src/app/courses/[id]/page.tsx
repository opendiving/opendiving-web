import type { Metadata } from "next";

import { CourseDetailPageContent } from "@/components/courses/course-detail-page-content";

export const metadata: Metadata = { title: "Courses" };

export default function CourseDetailPage() {
  return <CourseDetailPageContent />;
}
