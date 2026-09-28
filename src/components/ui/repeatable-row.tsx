import type { CSSProperties, ReactNode } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconTooltip } from "@/components/ui/tooltip";
import type { useDragSort } from "@/hooks/useDragSort";
import { cn } from "@/lib/utils";

type DragHandleProps = ReturnType<
  ReturnType<typeof useDragSort>["handleProps"]
>;

export interface RepeatableRowProps {
  // The row's place in the list ("Tank 2"), or its name where the entry has one.
  title: ReactNode;
  // Names the row's Remove button - see "Row-action names" in DECISIONS.md.
  removeLabel: string;
  onRemove: () => void;
  // For a list whose order is data. The label carries the keyboard equivalent.
  dragHandle?: { label: string; props: DragHandleProps };
  disabled?: boolean;
  as?: "div" | "li";
  ref?: (el: HTMLElement | null) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * One entry of a repeatable group of fields in a form - a dive's cylinder, a
 * trip's part: a bordered card with a header of drag handle, title and Remove,
 * and the entry's labelled fields beneath.
 */
export function RepeatableRow({
  title,
  removeLabel,
  onRemove,
  dragHandle,
  disabled,
  as: Tag = "div",
  ref,
  className,
  style,
  children,
}: RepeatableRowProps) {
  return (
    <Tag
      ref={ref}
      className={cn("space-y-4 rounded-lg border p-4", className)}
      style={style}
    >
      <div className="flex items-center gap-2">
        {dragHandle && (
          <IconTooltip label={dragHandle.label}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="cursor-grab active:cursor-grabbing"
              {...dragHandle.props}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
          </IconTooltip>
        )}
        <span className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">
          {title}
        </span>
        <IconTooltip label={removeLabel}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </IconTooltip>
      </div>
      {children}
    </Tag>
  );
}

/**
 * A labelled field inside a `RepeatableRow`, laid out as `FormItem` lays one out.
 *
 * `labelSuffix` follows the visible word for a screen reader only and names the
 * row: twenty controls all called "Start date" tell a controls list nothing about
 * which row they set. The visible text stays the start of the accessible name.
 * The space between them is a text node of its own because name computation
 * trims the text inside the hidden span.
 */
export function RepeatableRowField({
  id,
  label,
  labelSuffix,
  children,
}: {
  id: string;
  label: string;
  labelSuffix: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} <span className="sr-only">{labelSuffix}</span>
      </Label>
      {children}
    </div>
  );
}

// The button under a list of `RepeatableRow`s that appends the next one.
export function AddRowButton({ children, ...props }: ButtonProps) {
  return (
    <Button type="button" variant="outline" size="sm" {...props}>
      <Plus className="h-4 w-4 mr-2" />
      {children}
    </Button>
  );
}
