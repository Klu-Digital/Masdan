import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@masdan/ui/components/menu";

import { useTheme } from "@/components/theme-provider";

export const ModeToggle = () => {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <Menu>
      <MenuTrigger
        aria-label="Appearance"
        render={<Button size="icon" variant="ghost" />}
      >
        <HugeiconsIcon
          icon={resolvedTheme === "dark" ? Moon02Icon : Sun03Icon}
          strokeWidth={1.8}
        />
      </MenuTrigger>
      <MenuPopup align="end">
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
      </MenuPopup>
    </Menu>
  );
};
