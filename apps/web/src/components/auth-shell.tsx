import type { ReactNode } from "react";

import { BrandMark } from "./brand-mark";
import { ModeToggle } from "./mode-toggle";

/**
 * Every signed-out screen: the mark, one question, one form. No card — the
 * form sits on the canvas with room to breathe.
 */
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
  <div className="bg-background flex min-h-svh flex-col">
    <header className="flex items-center justify-between px-5 pt-5">
      <span className="flex items-center gap-2">
        <BrandMark className="size-7" />
        <span className="text-base font-semibold">Masdan</span>
      </span>
      <ModeToggle />
    </header>
    <main className="flex flex-1 items-start justify-center px-5 pt-16 pb-16 md:pt-24">
      <div className="animate-enter flex w-full max-w-sm flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {children}
        {footer ? (
          <div className="text-muted-foreground text-sm">{footer}</div>
        ) : null}
      </div>
    </main>
  </div>
);

export default AuthShell;
