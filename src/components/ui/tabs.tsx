"use client";

import * as React from "react";
import * as TabsPrimitive from "./primitives/tabs";
import type { AppComponentProps } from "./component-props";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Tabs;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.TabsList>,
  AppComponentProps<typeof TabsPrimitive.TabsList>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.TabsList
    activateOnFocus
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.TabsTrigger>,
  AppComponentProps<typeof TabsPrimitive.TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.TabsTrigger
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 touch:tap-target text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.TabsContent>,
  AppComponentProps<typeof TabsPrimitive.TabsContent>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.TabsContent
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
