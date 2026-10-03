import type { ReactNode } from "react";

import { BrandMark } from "./brand-mark";
import { DitherField } from "./dither-field";
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
  <div className="bg-surface flex min-h-svh items-center justify-center p-3 md:p-6">
    <div className="bg-background border-brand/20 grid w-full max-w-6xl overflow-hidden rounded-3xl border lg:min-h-[44rem] lg:grid-cols-2">
      <aside className="p-2">
        <div className="border-brand/20 relative h-40 overflow-hidden rounded-xl border lg:h-full">
          <DitherField />
          <figure
            className="bg-background border-brand/30 absolute right-5 bottom-5 left-5 m-0 hidden rounded-lg border p-4 lg:block"
            data-caster
          >
            <figcaption className="flex items-center gap-2">
              <BrandMark className="size-5" />
              <span className="text-sm font-semibold">Masdan</span>
            </figcaption>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Every account, bill and budget in one shared ledger.
            </p>
          </figure>
        </div>
      </aside>
      <main className="relative flex items-center justify-center px-6 py-16 sm:px-12">
        <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
          <span className="flex items-center gap-2 lg:invisible">
            <BrandMark className="size-6" />
            <span className="text-base font-semibold">Masdan</span>
          </span>
          <ModeToggle />
        </header>
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
  </div>
);

export default AuthShell;
