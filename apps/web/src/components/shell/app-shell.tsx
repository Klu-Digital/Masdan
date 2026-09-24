import {
  Logout02Icon,
  Mail01Icon,
  MoreHorizontalCircle01Icon,
  PlusSignIcon,
  Search01Icon,
  Settings02Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AppFrame,
  AppMain,
  AppNavItem,
  AppNavSection,
  AppScroll,
  AppSidebar,
  AppSidebarContent,
  AppSidebarFooter,
  AppSidebarHeader,
  AppSidebarToggle,
  AppTabBar,
  AppTabBarAction,
  AppTabBarItem,
  AppTopBar,
  AppTopBarSpacer,
  useAppFrame,
} from "@masdan/ui/components/app-frame";
import { Button } from "@masdan/ui/components/button";
import {
  Drawer,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@masdan/ui/components/drawer";
import { Kbd } from "@masdan/ui/components/kbd";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { useAppActions } from "@/components/app-actions";
import AppBreadcrumbs from "@/components/app-breadcrumbs";
import { useTheme } from "@/components/theme-provider";
import { useHousehold } from "@/hooks/use-household";
import { userInvitationsQueryOptions } from "@/lib/organization";
import { RemindersMenu } from "@/modules/reminders/components/reminders-menu";

import { HouseholdSwitcher } from "./household-switcher";
import { ADMIN_NAV, ORGANIZE_NAV, PRIMARY_NAV } from "./navigation";
import { NewMenu } from "./new-menu";
import { UserMenu, useSignOut } from "./user-menu";

const usePendingInvitations = (): number => {
  const invitations = useQuery(userInvitationsQueryOptions());
  return (
    invitations.data?.filter((invitation) => !invitation.expired).length ?? 0
  );
};

const Sidebar = ({
  activeOrganizationId,
  isPlatformAdmin,
  pendingInvitations,
}: {
  activeOrganizationId: string | null;
  isPlatformAdmin: boolean;
  pendingInvitations: number;
}) => {
  const { collapsed } = useAppFrame();
  return (
    <AppSidebar aria-label="Main">
      <AppSidebarHeader>
        <HouseholdSwitcher
          activeOrganizationId={activeOrganizationId}
          pendingInvitations={pendingInvitations}
        />
        {activeOrganizationId ? (
          <NewMenu
            trigger={
              collapsed ? (
                <Button aria-label="New" className="mx-auto" size="icon">
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                </Button>
              ) : (
                <Button className="justify-start">
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                  New
                </Button>
              )
            }
          />
        ) : null}
      </AppSidebarHeader>
      <AppSidebarContent aria-label="Sections">
        <AppNavSection>
          {PRIMARY_NAV.map((item) => (
            <AppNavItem
              icon={item.icon}
              key={item.to}
              label={item.label}
              render={<Link to={item.to} />}
            />
          ))}
        </AppNavSection>
        <AppNavSection label="Organize">
          {ORGANIZE_NAV.map((item) => (
            <AppNavItem
              icon={item.icon}
              key={item.to}
              label={item.label}
              render={<Link to={item.to} />}
            />
          ))}
        </AppNavSection>
        {isPlatformAdmin ? (
          <AppNavSection label="Admin">
            {ADMIN_NAV.map((item) => (
              <AppNavItem
                icon={item.icon}
                key={item.to}
                label={item.label}
                render={
                  <Link activeOptions={{ exact: item.exact }} to={item.to} />
                }
              />
            ))}
          </AppNavSection>
        ) : null}
      </AppSidebarContent>
      <AppSidebarFooter>
        <AppNavSection>
          {pendingInvitations > 0 ? (
            <AppNavItem
              badge={pendingInvitations}
              icon={Mail01Icon}
              label="Invitations"
              render={<Link to="/invitations" />}
            />
          ) : null}
          <AppNavItem
            icon={Settings02Icon}
            label="Settings"
            render={<Link to="/settings" />}
          />
        </AppNavSection>
        <UserMenu />
      </AppSidebarFooter>
    </AppSidebar>
  );
};

const HouseholdReminders = () => {
  const { activeOrganizationId, can } = useHousehold();
  if (!can({ reminder: ["read"] })) {
    return null;
  }
  return (
    <RemindersMenu
      activeOrganizationId={activeOrganizationId}
      canDismiss={can({ reminder: ["dismiss"] })}
    />
  );
};

const TopBar = () => {
  const { openCommandMenu } = useAppActions();
  return (
    <AppTopBar>
      <AppSidebarToggle />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <button
        aria-label="Search and commands"
        className="bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 hidden h-8 items-center gap-2 rounded-lg ps-2.5 pe-1.5 text-xs transition-colors outline-none focus-visible:ring-3 sm:flex"
        onClick={openCommandMenu}
        type="button"
      >
        <HugeiconsIcon
          className="size-4"
          icon={Search01Icon}
          strokeWidth={1.8}
        />
        <span className="w-36 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button
        aria-label="Search and commands"
        className="sm:hidden"
        onClick={openCommandMenu}
        size="icon"
        variant="ghost"
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} />
      </Button>
      <HouseholdReminders />
    </AppTopBar>
  );
};

const AppearancePicker = () => {
  const { setTheme, theme } = useTheme();
  return (
    <Tabs
      onValueChange={(value) => setTheme(String(value))}
      value={theme ?? "system"}
    >
      <TabsList aria-label="Appearance" className="w-full">
        <TabsTab value="light">Light</TabsTab>
        <TabsTab value="dark">Dark</TabsTab>
        <TabsTab value="system">System</TabsTab>
      </TabsList>
    </Tabs>
  );
};

const MoreRow = ({
  badge,
  children,
  icon,
}: {
  badge?: number;
  children: ReactNode;
  icon: typeof Mail01Icon;
}) => (
  <>
    <ListItemLeading>
      <span className="bg-secondary text-foreground flex size-8 items-center justify-center rounded-lg">
        <HugeiconsIcon className="size-4.5" icon={icon} strokeWidth={1.8} />
      </span>
    </ListItemLeading>
    <ListItemContent>
      <ListItemTitle>{children}</ListItemTitle>
    </ListItemContent>
    <ListItemTrailing chevron>
      {badge ? (
        <span className="bg-brand text-brand-foreground text-2xs rounded-full px-1.5 font-semibold tracking-normal tabular-nums">
          {badge}
        </span>
      ) : null}
    </ListItemTrailing>
  </>
);

/** Phone "More": everything that isn't one of the four tabs. */
const MoreSheet = ({
  activeOrganizationId,
  isPlatformAdmin,
  onOpenChange,
  open,
  pendingInvitations,
}: {
  activeOrganizationId: string | null;
  isPlatformAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pendingInvitations: number;
}) => {
  const signOut = useSignOut();
  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="bottom">
      <DrawerPopup className="max-h-[90svh]" showBar>
        <DrawerHeader>
          <DrawerTitle>More</DrawerTitle>
        </DrawerHeader>
        <DrawerPanel>
          <div className="flex flex-col gap-5">
            <div className="bg-card dark:ring-hairline rounded-2xl p-1.5 dark:ring-1">
              <HouseholdSwitcher
                activeOrganizationId={activeOrganizationId}
                pendingInvitations={pendingInvitations}
                placement="sheet"
              />
            </div>
            <List>
              {[...PRIMARY_NAV.slice(3), ...ORGANIZE_NAV].map((item) => (
                <ListItem
                  key={item.to}
                  render={
                    <Link onClick={() => onOpenChange(false)} to={item.to} />
                  }
                >
                  <MoreRow icon={item.icon}>{item.label}</MoreRow>
                </ListItem>
              ))}
              <ListItem
                render={
                  <Link onClick={() => onOpenChange(false)} to="/invitations" />
                }
              >
                <MoreRow badge={pendingInvitations} icon={Mail01Icon}>
                  Invitations
                </MoreRow>
              </ListItem>
            </List>
            <List>
              <ListItem
                render={
                  <Link
                    onClick={() => onOpenChange(false)}
                    to="/settings/household"
                  />
                }
              >
                <MoreRow icon={Settings02Icon}>Household settings</MoreRow>
              </ListItem>
              <ListItem
                render={
                  <Link onClick={() => onOpenChange(false)} to="/settings" />
                }
              >
                <MoreRow icon={UserCircleIcon}>Profile</MoreRow>
              </ListItem>
            </List>
            {isPlatformAdmin ? (
              <List>
                {ADMIN_NAV.map((item) => (
                  <ListItem
                    key={item.to}
                    render={
                      <Link onClick={() => onOpenChange(false)} to={item.to} />
                    }
                  >
                    <MoreRow
                      icon={item.icon}
                    >{`Admin · ${item.label}`}</MoreRow>
                  </ListItem>
                ))}
              </List>
            ) : null}
            <AppearancePicker />
            <Button
              className="mb-2"
              onClick={() => signOut()}
              variant="destructive-outline"
            >
              <HugeiconsIcon icon={Logout02Icon} strokeWidth={1.8} />
              Sign out
            </Button>
          </div>
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
};

const TabBar = ({ onMore }: { onMore: () => void }) => {
  const [first, second, third] = PRIMARY_NAV;
  return (
    <AppTabBar aria-label="Main">
      {[first, second].map((item) =>
        item ? (
          <AppTabBarItem
            icon={item.icon}
            key={item.to}
            label={item.label}
            render={<Link to={item.to} />}
          />
        ) : null
      )}
      <NewMenu
        side="top"
        trigger={
          <AppTabBarAction aria-label="New">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2.2} />
          </AppTabBarAction>
        }
      />
      {third ? (
        <AppTabBarItem
          icon={third.icon}
          label={third.label}
          render={<Link to={third.to} />}
        />
      ) : null}
      <AppTabBarItem
        icon={MoreHorizontalCircle01Icon}
        label="More"
        render={<button aria-label="More" onClick={onMore} type="button" />}
      />
    </AppTabBar>
  );
};

const sectionOf = (pathname: string) => pathname.split("/")[1] ?? "";

/**
 * Scroll the content pane back to the top on navigation, like a new page —
 * except when a ledger row opens its detail, which keeps the list in place.
 */
const ScrollReset = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const previous = useRef(pathname);
  useEffect(() => {
    const keepPlace =
      sectionOf(previous.current) === "transactions" &&
      sectionOf(pathname) === "transactions";
    previous.current = pathname;
    if (!keepPlace) {
      document.querySelector("#main")?.scrollTo({ top: 0 });
    }
  }, [pathname]);
  return null;
};

export const AppShell = ({
  activeOrganizationId,
  banner,
  children,
  isPlatformAdmin,
}: {
  activeOrganizationId: string | null;
  banner?: ReactNode;
  children: ReactNode;
  isPlatformAdmin: boolean;
}) => {
  const pendingInvitations = usePendingInvitations();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <AppFrame>
      <a
        className="bg-primary text-primary-foreground sr-only z-50 rounded-lg px-3 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        href="#main"
      >
        Skip to content
      </a>
      <Sidebar
        activeOrganizationId={activeOrganizationId}
        isPlatformAdmin={isPlatformAdmin}
        pendingInvitations={pendingInvitations}
      />
      <AppMain>
        {banner}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <TopBar />
          <AppScroll>
            <AppTopBarSpacer />
            <ScrollReset />
            {children}
          </AppScroll>
        </div>
      </AppMain>
      <TabBar onMore={() => setMoreOpen(true)} />
      <MoreSheet
        activeOrganizationId={activeOrganizationId}
        isPlatformAdmin={isPlatformAdmin}
        onOpenChange={setMoreOpen}
        open={moreOpen}
        pendingInvitations={pendingInvitations}
      />
    </AppFrame>
  );
};
