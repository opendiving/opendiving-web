"use client";

import { ReactNode } from "react";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconTooltip } from "@/components/ui/tooltip";

// A record's actions behind one icon button - the secondary ones beside Edit on
// a detail page, or all of them on a row that repeats down a list. An item that
// opens a dialog renders that dialog outside `children`: the menu's content
// unmounts the moment it closes, and takes anything inside it along.
export function ItemActionsMenu({
  children,
  label = "More actions",
  variant = "outline",
  size = "icon",
}: {
  children: ReactNode;
  // A row's menu names its row: a list of identical "More actions" tells a
  // screen reader's controls list nothing about which.
  label?: string;
  // Outline beside a detail page's outlined Edit; a row passes ghost, as a
  // table's row actions are.
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  return (
    <DropdownMenu>
      <IconTooltip label={label}>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size}>
            <EllipsisVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeleteMenuItem({
  onSelect,
  disabled,
}: {
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      disabled={disabled}
      className="text-destructive focus:text-destructive"
    >
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </DropdownMenuItem>
  );
}
