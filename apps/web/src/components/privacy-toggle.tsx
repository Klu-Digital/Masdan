import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@masdan/ui/components/tooltip";
import { usePrivacyMode } from "@masdan/ui/lib/privacy-mode";

export const PrivacyToggle = () => {
  const [on, setOn] = usePrivacyMode();
  const label = on ? "Show amounts" : "Hide amounts";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={on}
            onClick={() => setOn(!on)}
            size="icon"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon
          icon={on ? ViewOffSlashIcon : ViewIcon}
          strokeWidth={1.8}
        />
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
};
