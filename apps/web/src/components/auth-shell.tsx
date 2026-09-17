import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import type { ReactNode } from "react";

import { ModeToggle } from "./mode-toggle";

const AuthShell = ({
  children,
  description,
  footer,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  title: string;
}) => (
  <div className="flex min-h-svh flex-col">
    <div className="flex justify-end p-4">
      <ModeToggle />
    </div>
    <div className="flex flex-1 items-start justify-center px-4 pb-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* An <h1> so each auth page has a document heading. The rule reads
              the bare <h1 /> passed to `render` and cannot see that Base UI
              merges the children into it. */}
          {/* oxlint-disable-next-line jsx-a11y/heading-has-content */}
          <CardTitle render={<h1 />}>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardPanel>{children}</CardPanel>
        {footer ? (
          <div className="text-muted-foreground px-6 pb-6 text-center text-sm">
            {footer}
          </div>
        ) : null}
      </Card>
    </div>
  </div>
);

export default AuthShell;
