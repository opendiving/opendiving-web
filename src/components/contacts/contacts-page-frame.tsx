"use client";

import { BookUser } from "lucide-react";
import {
  TableListFrame,
  type TableListFrameCopy,
  type TableListFrameData,
} from "@/components/ui/table-list-frame";

const COPY: TableListFrameCopy = {
  title: "Contacts",
  description:
    "The dive centers, schools, shops and places you stayed, kept once",
  newLabel: "New contact",
  listTitle: "Contact List",
  noun: "contact",
  search: {
    id: "contact-search",
    label: "Search contacts by name or city",
    toggleLabel: "Search contacts",
    placeholder: "Search by name or city...",
  },
  noMatch: "No contacts match that name or city.",
  empty: {
    icon: BookUser,
    title: "No contacts yet",
    description:
      "Add the dive centers, shops and places you stay at once, and pick them from your dives, courses and trips.",
    action: "Add your first contact",
  },
  columns: ["Name", "Roles", "City", "Phone", "Website"],
};

// Everything /contacts draws before its rows exist.
export function ContactsPageFrame(props: TableListFrameData) {
  return <TableListFrame copy={COPY} {...props} />;
}
