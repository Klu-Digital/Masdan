"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ArrowDown01Icon, SidebarLeft01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@masdan/ui/components/collapsible";
import { ScrollArea } from "@masdan/ui/components/scroll-area";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@masdan/ui/components/tooltip";
import { useMediaQuery } from "@masdan/ui/hooks/use-media-query";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/*
 * The application frame. Three shapes, one component tree:
 *
 * - phone (< 768): no sidebar; a tab bar sits at the bottom.
 * - tablet (768–1279): an icon rail, expandable.
 * - desktop (>= 1280): the full sidebar, collapsible to the rail.
 *
 * The person's explicit choice wins over the breakpoint default and is kept
 * per browser.
 */

const STORAGE_KEY = "masdan.sidebar";

type SidebarPreference = "auto" | "expanded" | "collapsed";

const readPreference = (): SidebarPreference => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "expanded" || value === "collapsed" ? value : "auto";
  } catch {
    return "auto";
  }
};

interface FrameContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const noopToggle = (): void => {
  // Outside a frame there is no sidebar to toggle.
};

const FrameContext = createContext<FrameContextValue>({
  collapsed: false,
  toggle: noopToggle,
});

export const useAppFrame = (): FrameContextValue => useContext(FrameContext);

export const AppFrame = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement => {
  const wide = useMediaQuery("xl");
  const [preference, setPreference] =
    useState<SidebarPreference>(readPreference);
  const collapsed = preference === "auto" ? !wide : preference === "collapsed";

  const toggle = useCallback(() => {
    const next = collapsed ? "expanded" : "collapsed";
    setPreference(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice lasts for this page view only.
    }
  }, [collapsed]);

  const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);

  return (
    <FrameContext.Provider value={value}>
      <div
        className={cn(
          "bg-background flex h-svh w-full overflow-hidden",
          className,
        )}
        data-collapsed={collapsed || undefined}
        data-slot="app-frame"
      >
        {children}
      </div>
    </FrameContext.Provider>
  );
};

export const AppSidebar = ({
  children,
  className,
  ...props
}: React.ComponentProps<"aside">): React.ReactElement => {
  const { collapsed } = useAppFrame();
  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border ease-spring relative hidden shrink-0 flex-col border-e transition-[width] duration-[420ms] motion-reduce:transition-none md:flex",
        collapsed ? "w-17" : "w-64",
        className,
      )}
      data-collapsed={collapsed || undefined}
      data-slot="app-sidebar"
      {...props}
    >
      {children}
    </aside>
  );
};

export const AppSidebarHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex flex-col gap-2 px-3 pt-3 pb-2", className)}
    data-slot="app-sidebar-header"
    {...props}
  />
);

export const AppSidebarContent = ({
  className,
  ...props
}: React.ComponentProps<"nav">): React.ReactElement => (
  <nav
    className={cn(
      "flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-3 py-2",
      className,
    )}
    data-slot="app-sidebar-content"
    {...props}
  />
);

export const AppSidebarFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex flex-col gap-1 px-3 pt-2 pb-3", className)}
    data-slot="app-sidebar-footer"
    {...props}
  />
);

export const AppNavSection = ({
  children,
  className,
  collapsible,
  defaultOpen = false,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /** Fold the items under the label. Needs a `label`; the rail shows them flat. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  label?: string;
}): React.ReactElement => {
  const { collapsed } = useAppFrame();
  if (collapsible && label && !collapsed) {
    return (
      <Collapsible
        className={cn("flex flex-col gap-0.5", className)}
        data-slot="app-nav-section"
        defaultOpen={defaultOpen}
      >
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 group/section flex h-7 w-full items-center gap-1 rounded-md px-2.5 pt-1.5 text-xs font-medium outline-none focus-visible:ring-3">
          <span className="min-w-0 flex-1 truncate text-start">{label}</span>
          <HugeiconsIcon
            className="size-3.5 shrink-0 transition-transform duration-200 group-data-panel-open/section:rotate-180"
            icon={ArrowDown01Icon}
            strokeWidth={2}
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <ul className="flex flex-col gap-0.5">{children}</ul>
        </CollapsiblePanel>
      </Collapsible>
    );
  }
  return (
    <div
      className={cn("flex flex-col gap-0.5", className)}
      data-slot="app-nav-section"
    >
      {label ? (
        <div
          aria-hidden={collapsed || undefined}
          className={cn(
            "text-muted-foreground h-7 truncate px-2.5 pt-1.5 text-xs font-medium transition-opacity duration-200",
            collapsed && "opacity-0",
          )}
        >
          {label}
        </div>
      ) : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
};

const navItemClassName =
  "group/nav text-sidebar-foreground relative flex h-9 w-full min-w-0 items-center gap-3 rounded-lg px-2.5 text-sm font-medium outline-none transition-[background-color,color,transform] duration-150 select-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:active:scale-100 aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-xs dark:aria-[current=page]:bg-sidebar-accent dark:aria-[current=page]:shadow-none data-active:bg-background data-active:text-foreground data-active:shadow-xs dark:data-active:bg-sidebar-accent dark:data-active:shadow-none [&_svg]:size-4.5 [&_svg]:shrink-0";

/**
 * A sidebar destination. Pass the router link as `render`; the link's own
 * `aria-current` marks it active. In the rail its label moves into a tooltip.
 */
export const AppNavItem = ({
  badge,
  className,
  icon,
  label,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  badge?: React.ReactNode;
  icon: IconSvgElement;
  label: string;
}): React.ReactElement => {
  const { collapsed } = useAppFrame();
  const content = useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-label": collapsed ? label : undefined,
        children: (
          <>
            <HugeiconsIcon
              className="text-muted-foreground group-hover/nav:text-foreground group-aria-[current=page]/nav:text-brand-text group-data-active/nav:text-brand-text"
              icon={icon}
              strokeWidth={1.8}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate transition-opacity duration-200",
                collapsed && "sr-only",
              )}
            >
              {label}
            </span>
            {badge ? (
              <span
                className={cn(
                  "bg-brand text-brand-foreground text-2xs flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 font-semibold tracking-normal tabular-nums",
                  collapsed && "absolute end-1 top-1 h-4 min-w-4",
                )}
              >
                {badge}
              </span>
            ) : null}
          </>
        ),
        className: cn(
          navItemClassName,
          collapsed && "justify-center px-0",
          className,
        ),
      },
      props,
    ),
    render,
  });

  if (!collapsed) {
    return <li className="list-none">{content}</li>;
  }
  return (
    <li className="list-none">
      <Tooltip>
        <TooltipTrigger render={content} />
        <TooltipPopup side="right" sideOffset={10}>
          {label}
        </TooltipPopup>
      </Tooltip>
    </li>
  );
};

export const AppSidebarToggle = ({
  className,
}: {
  className?: string;
}): React.ReactElement => {
  const { collapsed, toggle } = useAppFrame();
  return (
    <button
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={!collapsed}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 hidden size-8 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-3 md:inline-flex [&_svg]:size-4.5",
        className,
      )}
      onClick={toggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      type="button"
    >
      <HugeiconsIcon icon={SidebarLeft01Icon} strokeWidth={1.8} />
    </button>
  );
};

export const AppMain = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("relative flex min-w-0 flex-1 flex-col", className)}
    data-slot="app-main"
    {...props}
  />
);

/**
 * Scroll container for page content. It sits below the top bar, so its
 * scrollbar lives entirely within the main body.
 */
export const AppScroll = ({
  className,
  ...props
}: React.ComponentProps<typeof ScrollArea>): React.ReactElement => (
  <ScrollArea
    className={cn("flex-1", className)}
    overscrollContain
    viewportProps={{
      className: "focus:outline-none",
      id: "main",
      role: "main",
      tabIndex: -1,
    }}
    {...props}
  />
);

export const AppTopBar = ({
  className,
  ...props
}: React.ComponentProps<"header">): React.ReactElement => (
  <header
    className={cn(
      "bg-material border-hairline z-30 flex h-13 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150 sm:px-4",
      className,
    )}
    data-slot="app-top-bar"
    {...props}
  />
);

export const AppTabBar = ({
  className,
  ...props
}: React.ComponentProps<"nav">): React.ReactElement => (
  <nav
    className={cn(
      "bg-material border-hairline fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-stretch border-t pb-[env(safe-area-inset-bottom)] supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150 md:hidden",
      className,
    )}
    data-slot="app-tab-bar"
    {...props}
  />
);

const tabItemClassName =
  "text-muted-foreground flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium outline-none transition-colors active:opacity-60 focus-visible:bg-accent aria-[current=page]:text-brand-text data-active:text-brand-text [&_svg]:size-6";

export const AppTabBarItem = ({
  className,
  icon,
  label,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  icon: IconSvgElement;
  label: string;
}): React.ReactElement =>
  useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        children: (
          <>
            <HugeiconsIcon icon={icon} strokeWidth={1.8} />
            <span>{label}</span>
          </>
        ),
        className: cn(tabItemClassName, className),
      },
      props,
    ),
    render,
  });

/** The centre "add" control in the tab bar: the one action always in reach. */
export const AppTabBarAction = ({
  className,
  children,
  ...props
}: React.ComponentProps<"button">): React.ReactElement => (
  <button
    className={cn(
      "focus-visible:[&>span]:ring-ring/50 flex h-14 items-center justify-center outline-none focus-visible:[&>span]:ring-3",
      className,
    )}
    type="button"
    {...props}
  >
    <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full shadow-xs transition-transform duration-150 active:scale-90 motion-reduce:active:scale-100 [&_svg]:size-5.5">
      {children}
    </span>
  </button>
);
