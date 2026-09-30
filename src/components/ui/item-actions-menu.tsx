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

// Secondary actions, behind one icon button beside Edit - on a detail page, or
// on a row that repeats down a list. An item that opens a dialog renders that
// dialog outside `children`: the menu's content unmounts the moment it closes,
// and takes anything inside it along.
export function ItemActionsMenu({
  children,
  label = "More actions",
  variant = "outline",
  size = "icon",
}: {
  children: ReactNode;
  // A row's menu names its row, as the row's Edit does: a list of identical
  // "More actions" tells a screen reader's controls list nothing about which.
  label?: string;
  // Matched to the Edit button beside it, which is an outline button with text
  // on a detail page and a ghost icon in a row.
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
