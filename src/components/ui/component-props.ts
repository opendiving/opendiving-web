import type * as React from "react";

export type AppComponentProps<T extends React.ElementType> = Omit<
  React.ComponentPropsWithRef<T>,
  "className"
> & { className?: string };
