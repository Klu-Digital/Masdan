import { ChevronRightIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@masdan/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@masdan/ui/components/sidebar";
import { Link, useMatchRoute } from "@tanstack/react-router";

import type { FileRoutesByTo } from "@/routeTree.gen";

export type NavPath = keyof FileRoutesByTo;

export interface NavItem {
  icon: IconSvgElement;
  items?: { title: string; to: NavPath }[];
  title: string;
  to: NavPath;
}

const NavLeaf = ({ item }: { item: NavItem }) => {
  const matchRoute = useMatchRoute();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={Boolean(matchRoute({ to: item.to }))}
        // Shown only when the sidebar is collapsed to icons, which is the point
        // of the icon rail: the label has to come back from somewhere.
        render={<Link to={item.to} />}
        tooltip={item.title}
      >
        <HugeiconsIcon icon={item.icon} strokeWidth={2} />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const NavBranch = ({
  item,
}: {
  item: NavItem & { items: NonNullable<NavItem["items"]> };
}) => {
  const matchRoute = useMatchRoute();
  // `fuzzy` so /settings/organization counts as being inside Settings.
  const sectionIsOpen = Boolean(matchRoute({ fuzzy: true, to: item.to }));

  return (
    <Collapsible
      // `defaultOpen` rather than `open`: the section opens itself when you
      // navigate into it, and stays however the person left it after that.
      defaultOpen={sectionIsOpen}
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton
            className="group/collapsible"
            isActive={sectionIsOpen}
            tooltip={item.title}
          />
        }
      >
        <HugeiconsIcon icon={item.icon} strokeWidth={2} />
        <span>{item.title}</span>
        <HugeiconsIcon
          icon={ChevronRightIcon}
          strokeWidth={2}
          className="ms-auto transition-transform duration-200 group-data-[panel-open]/collapsible:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items.map((subItem) => (
            <SidebarMenuSubItem key={subItem.to}>
              <SidebarMenuSubButton
                isActive={Boolean(matchRoute({ to: subItem.to }))}
                render={<Link to={subItem.to} />}
              >
                <span>{subItem.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
};

const NavMain = ({ items, label }: { items: NavItem[]; label: string }) => (
  <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarMenu>
      {items.map((item) =>
        item.items ? (
          <NavBranch item={{ ...item, items: item.items }} key={item.to} />
        ) : (
          <NavLeaf item={item} key={item.to} />
        )
      )}
    </SidebarMenu>
  </SidebarGroup>
);

export default NavMain;
