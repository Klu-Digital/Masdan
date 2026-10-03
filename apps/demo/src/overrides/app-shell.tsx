import type { ComponentProps } from "react";

import { AppShell as WebAppShell } from "@/components/shell/app-shell";

const DemoBanner = () => (
  <output className="bg-brand flex items-center justify-center gap-1 px-4 py-2 text-center text-xs font-medium text-white">
    You’re exploring the Masdan demo. Changes stay in this tab and reset when
    you reload or sign out.
  </output>
);

export const AppShell = ({
  banner,
  ...props
}: ComponentProps<typeof WebAppShell>) => (
  <WebAppShell {...props} banner={banner ?? <DemoBanner />} />
);
