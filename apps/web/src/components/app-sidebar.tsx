import {
  Building01Icon,
  Clock01Icon,
  File01Icon,
  LayoutDashboardIcon,
  Mail01Icon,
  Settings02Icon,
  Shield01Icon,
  Tag01Icon,
  TagsIcon,
  ToggleOnIcon,
  UserGroupIcon,
  UserMultiple02Icon,
  Wallet01Icon,
  Wrench01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@masdan/ui/components/sidebar";

import NavMain from "@/components/nav-main";
import type { NavItem } from "@/components/nav-main";
import NavUser from "@/components/nav-user";
import OrganizationSwitcher from "@/components/organization-switcher";

const navMain: NavItem[] = [
  {
    icon: LayoutDashboardIcon,
    title: "Dashboard",
    to: "/dashboard",
  },
  {
    icon: Mail01Icon,
    title: "Invitations",
    to: "/invitations",
  },
  {
    icon: Tag01Icon,
    title: "Categories",
    to: "/categories",
  },
  {
    icon: TagsIcon,
    title: "Tags",
    to: "/tags",
  },
  {
    icon: Wallet01Icon,
    title: "Accounts",
    to: "/accounts",
  },
  {
    icon: Settings02Icon,
    items: [
      { title: "Profile", to: "/settings" },
      { title: "Household", to: "/settings/household" },
    ],
    title: "Settings",
    to: "/settings",
  },
];

const navAdmin: NavItem[] = [
  {
    icon: Shield01Icon,
    title: "Overview",
    to: "/admin",
  },
  {
    icon: UserGroupIcon,
    title: "Users",
    to: "/admin/users",
  },
  {
    icon: Building01Icon,
    title: "Organizations",
    to: "/admin/organizations",
  },
  {
    icon: Clock01Icon,
    title: "Sessions",
    to: "/admin/sessions",
  },
  {
    icon: File01Icon,
    title: "Files",
    to: "/admin/files",
  },
  {
    icon: ZapIcon,
    title: "Jobs",
    to: "/admin/jobs",
  },
  {
    icon: ToggleOnIcon,
    title: "Feature flags",
    to: "/admin/flags",
  },
  {
    icon: UserMultiple02Icon,
    title: "Roles",
    to: "/admin/roles",
  },
  {
    icon: Wrench01Icon,
    title: "System",
    to: "/admin/system",
  },
];

const AppSidebar = ({
  activeOrganizationId,
  isPlatformAdmin,
}: {
  activeOrganizationId: string | null;
  isPlatformAdmin: boolean;
}) => (
  <Sidebar collapsible="icon" variant="inset">
    <SidebarHeader>
      <OrganizationSwitcher activeOrganizationId={activeOrganizationId} />
    </SidebarHeader>
    <SidebarContent>
      <NavMain items={navMain} label="Platform" />
      {isPlatformAdmin ? <NavMain items={navAdmin} label="Admin" /> : null}
    </SidebarContent>
    <SidebarFooter>
      <NavUser />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
);

export default AppSidebar;
