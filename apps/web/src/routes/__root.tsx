import { Button } from "@masdan/ui/components/button";
import { ToastProvider } from "@masdan/ui/components/toast";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { sessionQueryOptions } from "@/lib/session";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

const RootComponent = () => (
  <>
    <HeadContent />
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </ThemeProvider>
    <TanStackRouterDevtools position="bottom-left" />
    <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
  </>
);

const RootErrorComponent = ({ reset }: { reset: () => void }) => (
  <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
    <div>
      <h1 className="font-heading text-xl font-semibold">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        We could not reach the server. Check your connection and try again.
      </p>
    </div>
    <Button onClick={reset}>Try again</Button>
  </div>
);

export const Route = createRootRouteWithContext<RouterAppContext>()({
  /**
   * Resolved once here: three guards need this answer on a single navigation.
   */
  beforeLoad: async ({ context }) => ({
    session: await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      // `ensureQueryData` is cache-first and never revalidates, so without this
      // a session revoked elsewhere would keep waving people through until the
      // entry was garbage collected.
      revalidateIfStale: true,
    }),
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  head: () => ({
    links: [
      {
        href: "/favicon.ico",
        rel: "icon",
      },
    ],
    meta: [
      {
        title: "masdan",
      },
      {
        content: "masdan is a web application",
        name: "description",
      },
    ],
  }),
});
