import {
  Analytics01Icon,
  Building01Icon,
  Calendar03Icon,
  Clock01Icon,
  File01Icon,
  Folder02Icon,
  Home01Icon,
  Invoice02Icon,
  MagicWand01Icon,
  PieChart01Icon,
  RepeatIcon,
  Shield01Icon,
  Tag01Icon,
  Target02Icon,
  ToggleOnIcon,
  UserGroupIcon,
  UserMultiple02Icon,
  Wallet01Icon,
  Wrench01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import type { FileRoutesByTo } from "@/routeTree.gen";

export type NavPath = keyof FileRoutesByTo;

export interface NavDestination {
  icon: IconSvgElement;
  /** Match only this exact path, not its children. */
  exact?: boolean;
  label: string;
  to: NavPath;
}

/** The mobile tab bar fits the first three; the rest go under More. */
export const PRIMARY_NAV: NavDestination[] = [
  { icon: Home01Icon, label: "Overview", to: "/dashboard" },
  { icon: Invoice02Icon, label: "Transactions", to: "/transactions" },
  { icon: Wallet01Icon, label: "Accounts", to: "/accounts" },
  { icon: Analytics01Icon, label: "Reports", to: "/reports" },
  { icon: PieChart01Icon, label: "Budgets", to: "/budgets" },
  { icon: Target02Icon, label: "Goals", to: "/goals" },
  { icon: RepeatIcon, label: "Recurring", to: "/recurring" },
  { icon: Calendar03Icon, label: "Bills", to: "/bills" },
];

export const ORGANIZE_NAV: NavDestination[] = [
  { icon: Folder02Icon, label: "Categories", to: "/categories" },
  { icon: Tag01Icon, label: "Tags", to: "/tags" },
  { icon: MagicWand01Icon, label: "Rules", to: "/rules" },
];

export const ADMIN_NAV: NavDestination[] = [
  { exact: true, icon: Shield01Icon, label: "Overview", to: "/admin" },
  { icon: UserGroupIcon, label: "Users", to: "/admin/users" },
  { icon: Building01Icon, label: "Organizations", to: "/admin/organizations" },
  { icon: Clock01Icon, label: "Sessions", to: "/admin/sessions" },
  { icon: File01Icon, label: "Files", to: "/admin/files" },
  { icon: ZapIcon, label: "Jobs", to: "/admin/jobs" },
  { icon: ToggleOnIcon, label: "Feature flags", to: "/admin/flags" },
  { icon: UserMultiple02Icon, label: "Roles", to: "/admin/roles" },
  { icon: Wrench01Icon, label: "System", to: "/admin/system" },
];
