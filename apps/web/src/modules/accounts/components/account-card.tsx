import { CreditCardVisual } from "@/components/finance/credit-card-visual";

import { cardPresentation } from "../card-art";
import type { CardIdentity } from "../card-art";
import { cardCountriesOf, useCardCatalog } from "../card-catalog";

/** A credit-card account drawn as its card, at any of the renderer's sizes. */
export const AccountCard = ({
  account,
  className,
  interactive,
  size = "full",
}: {
  account: CardIdentity;
  className?: string;
  interactive?: boolean;
  size?: "compact" | "full" | "thumb";
}) => {
  const catalog = useCardCatalog(cardCountriesOf(account));
  const shown = cardPresentation(catalog, account);
  return (
    <CreditCardVisual
      art={shown.art}
      className={className}
      identity={shown.identity}
      interactive={interactive}
      issuer={shown.issuer}
      label={shown.label}
      lastFour={shown.lastFour}
      network={shown.network}
      networkLabel={shown.networkLabel}
      size={size}
      tint={shown.tint}
    />
  );
};

/** A card as a swatch, where a row would otherwise show an account icon. */
export const AccountCardThumb = ({
  account,
  size = "default",
}: {
  account: CardIdentity;
  size?: "default" | "sm" | "xs";
}) => {
  // A shade wider than the IconTile each stands in for, so rows keep their rhythm.
  if (size === "xs") {
    return (
      <AccountCard account={account} className="w-7 shrink-0" size="thumb" />
    );
  }
  if (size === "sm") {
    return (
      <AccountCard account={account} className="w-9 shrink-0" size="thumb" />
    );
  }
  return (
    <AccountCard account={account} className="w-11 shrink-0" size="thumb" />
  );
};
