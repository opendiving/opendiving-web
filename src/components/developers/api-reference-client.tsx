"use client";

import dynamic from "next/dynamic";

import { SectionSpinner } from "@/components/ui/section-spinner";

// Browser-only: Scalar is a Vue app that mounts into a DOM node, and the server has
// neither, so rendering it there would only ship its bundle to the server for nothing.
export const ApiReferenceClient = dynamic(
  () => import("./api-reference").then((m) => m.ApiReference),
  { ssr: false, loading: () => <SectionSpinner /> },
);
