"use client";

import { Users } from "lucide-react";
import {
  TableListFrame,
  type TableListFrameCopy,
  type TableListFrameData,
} from "@/components/ui/table-list-frame";

const COPY: TableListFrameCopy = {
  title: "People",
  description:
    "Your buddies, guides, instructors and the people who came along, kept once",
  newLabel: "New person",
  listTitle: "People List",
  noun: "person",
  pluralNoun: "people",
  search: {
    id: "person-search",
    label: "Search people by name or username",
    toggleLabel: "Search people",
    placeholder: "Search by name or username...",
  },
  noMatch: "No people match that name or username.",
  empty: {
    icon: Users,
    title: "No people yet",
    description:
      "Add the people you dive with once, and pick them from your dives, trips and courses.",
    action: "Add your first person",
  },
  columns: ["Name", "Username", "Email", "Phone", "Dives"],
};

// Everything /people draws before its rows exist.
export function PeoplePageFrame(props: TableListFrameData) {
  return <TableListFrame copy={COPY} {...props} />;
}
