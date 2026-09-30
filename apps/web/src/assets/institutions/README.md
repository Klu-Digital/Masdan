# Institution logos

One file per institution, named by its `logoKey` from `packages/db/src/reference/interest-presets.ts`: `maribank.png`, `eastwest.svg`. `InstitutionLogo` picks them up at build time; an institution without a file shows its initials on its brand colour. Nothing here is fetched at runtime.

The PNGs are each bank's official App Store icon, resized to 128×128, with any app-name text cropped off (BDO's "online"). `eastwest.svg` is the diamond from the footer logo on eastwestbanker.com, since their app icon carries the EasyWay name. Keep new ones square and at most 128×128.
