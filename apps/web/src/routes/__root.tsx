import { ToastProvider } from "@masdan/ui/components/toast";
import { TooltipProvider } from "@masdan/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { RouteError } from "@/components/route-error";
import { ThemeProvider } from "@/components/theme-provider";
import { sessionQueryOptions } from "@/lib/session";
import type { orpc } from "@/utils/orpc";

import "../index.css";

interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

const RootComponent = () => (
  <>
    <HeadContent />
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      <TooltipProvider delay={400}>
        <ToastProvider position="top-center">
          <Outlet />
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
    <TanStackRouterDevtools position="bottom-left" />
    <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
  </>
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
  errorComponent: RouteError,
  head: () => ({
    links: [
      {
        href: "/favicon.ico",
        rel: "icon",
      },
    ],
    meta: [
      {
        title: "Masdan",
      },
      {
        content: "Masdan — household money, clearly.",
        name: "description",
      },
    ],
  }),
});
