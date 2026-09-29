import type { ReactNode } from "react";

export const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p className="bg-card text-muted-foreground dark:ring-hairline rounded-3xl px-5 py-8 text-center text-sm dark:ring-1">
    {children}
  </p>
);
