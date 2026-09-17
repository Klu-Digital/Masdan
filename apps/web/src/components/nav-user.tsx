import {
  BadgeCheckIcon,
  LogOutIcon,
  SunMoonIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback } from "@k22i/ui/components/avatar";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@k22i/ui/components/menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@k22i/ui/components/sidebar";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { useTheme } from "@/components/theme-provider";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

/** "Ada Lovelace" -> "AL", "ada" -> "AD". */
const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "").slice(0, 2).toUpperCase();
  }
  return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
};

const NavUser = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile } = useSidebar();
  const { setTheme } = useTheme();
  // Reads the cache entry the route guards already populated — no second fetch.
  const { data: session } = useSession();

  if (!session) {
    return null;
  }

  const { email, name } = session.user;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar>
              <AvatarFallback>{initialsOf(name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {email}
              </span>
            </div>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="ms-auto size-4"
            />
          </MenuTrigger>
          {/* On a phone the sidebar is a sheet, so a popup to its right would
              open off-screen. */}
          <MenuPopup
            align={isMobile ? "center" : "end"}
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
          >
            <MenuGroup>
              <MenuItem render={<Link to="/settings" />}>
                <HugeiconsIcon icon={BadgeCheckIcon} strokeWidth={2} />
                Account
              </MenuItem>
              <MenuSub>
                <MenuSubTrigger>
                  <HugeiconsIcon icon={SunMoonIcon} strokeWidth={2} />
                  Theme
                </MenuSubTrigger>
                <MenuSubPopup>
                  <MenuItem onClick={() => setTheme("light")}>Light</MenuItem>
                  <MenuItem onClick={() => setTheme("dark")}>Dark</MenuItem>
                  <MenuItem onClick={() => setTheme("system")}>System</MenuItem>
                </MenuSubPopup>
              </MenuSub>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem
              onClick={async () => {
                await authClient.signOut();
                // Drop every cached answer, not just the session: org-scoped
                // data belongs to the account signing out.
                await invalidateSession(queryClient);
                queryClient.clear();
                // Straight to /login rather than via `/`, which would only
                // bounce here anyway.
                await navigate({ to: "/login" });
              }}
              variant="destructive"
            >
              <HugeiconsIcon icon={LogOutIcon} strokeWidth={2} />
              Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default NavUser;
