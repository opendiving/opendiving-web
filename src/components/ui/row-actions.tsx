"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Edit, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { TableCell } from "@/components/ui/table";
import { IconTooltip } from "@/components/ui/tooltip";

/**
 * A table row's last cell: View when the record has a page, Edit, whatever the
 * row adds in `children`, then Delete.
 *
 * Every control is named after the row as well as the action, from `label`:
 * ten identical "Edit"s tell a screen reader's controls list nothing about
 * which row. See DECISIONS.md, "Ten rows of 'Edit' name nothing".
 */
export function RowActions({
  label,
  viewHref,
  onEdit,
  onDelete,
  isDeleting,
  children,
}: {
  label: string;
  viewHref?: string;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  children?: ReactNode;
}) {
  return (
    <TableCell className="text-right">
      <div className="flex justify-end gap-2">
        {viewHref && (
          <IconTooltip label={`View ${label}`}>
            <Button variant="ghost" size="sm" asChild>
              <Link href={viewHref}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
          </IconTooltip>
        )}
        <IconTooltip label={`Edit ${label}`}>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
        </IconTooltip>
        {children}
        <IconTooltip label={`Delete ${label}`}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <ButtonSpinner /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </IconTooltip>
      </div>
    </TableCell>
  );
}
