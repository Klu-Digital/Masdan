import {
  ComputerIcon,
  Logout02Icon,
  Moon02Icon,
  Sun03Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAppFrame } from "@masdan/ui/components/app-frame";
import { Avatar, AvatarFallback } from "@masdan/ui/components/avatar";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import { cn } from "@masdan/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { useTheme } from "@/components/theme-provider";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

import { initialsOf } from "./initials";

export const useSignOut = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    await authClient.signOut();
    // Every cached answer belonged to the account signing out.
    await invalidateSession(queryClient);
    queryClient.clear();
    await navigate({ to: "/login" });
  };
};

const ThemeChoices = () => {
  const { setTheme, theme } = useTheme();
  return (
    <MenuGroup>
      <MenuGroupLabel>Appearance</MenuGroupLabel>
      <MenuRadioGroup
        onValueChange={(value) => setTheme(String(value))}
        value={theme ?? "system"}
      >
        <MenuRadioItem value="light">
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              className="size-4"
              icon={Sun03Icon}
              strokeWidth={1.8}
            />
            Light
          </span>
        </MenuRadioItem>
        <MenuRadioItem value="dark">
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              className="size-4"
              icon={Moon02Icon}
              strokeWidth={1.8}
            />
            Dark
          </span>
        </MenuRadioItem>
        <MenuRadioItem value="system">
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              className="size-4"
              icon={ComputerIcon}
              strokeWidth={1.8}
            />
            System
          </span>
        </MenuRadioItem>
      </MenuRadioGroup>
    </MenuGroup>
  );
};

export const UserMenu = () => {
  const { collapsed } = useAppFrame();
  const { data: session } = useSession();
  const signOut = useSignOut();

  if (!session) {
    return null;
  }
  const { email, name } = session.user;

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            aria-label={`Account: ${name}`}
            className={cn(
              "hover:bg-sidebar-accent focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-2 text-left transition-colors outline-none focus-visible:ring-3",
              collapsed && "justify-center px-0"
            )}
            type="button"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        {collapsed ? null : (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {email}
            </span>
          </span>
        )}
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-60" side="top">
        <MenuItem render={<Link to="/settings" />}>
          <HugeiconsIcon icon={UserCircleIcon} strokeWidth={1.8} />
          Profile
        </MenuItem>
        <MenuSeparator />
        <ThemeChoices />
        <MenuSeparator />
        <MenuItem onClick={() => signOut()} variant="destructive">
          <HugeiconsIcon icon={Logout02Icon} strokeWidth={1.8} />
          Sign out
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
};
