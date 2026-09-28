# Contributing cards

The catalog turns a credit-card account into a picture of the real card, drawn from data: a gradient, a texture, one focal element. Contributions are data, not artwork.

## Layout

```
src/countries.ts                    the country registry: code, name, currencies, loader
src/all.ts                          every country, loaded eagerly (server, tests)
src/vocabulary.ts                   the shapes a card may use: patterns, motifs, networks
src/countries/<cc>/issuers.ts       the country's banks and the names people type for them
src/countries/<cc>/products/*.ts    one file per bank
src/countries/<cc>/cards.ts         assembles the country
```

`<cc>` is the ISO 3166-1 alpha-2 code, lowercase. Every key starts with it: issuer `ph-bpi`, product `ph-bpi-gold-rewards-mastercard`.

## Add a card

1. Find the card on the bank's official site. Put the page in the file's `// Reference:` comment.
2. Add an entry to `countries/<cc>/products/<bank>.ts`, copying a neighbour's shape.
3. Build the look only from `CARD_PATTERNS` and `CARD_MOTIFS`, and take the nearest match. A card reads as itself from its colour, one texture and one focal element.
4. Run `pnpm exec vitest run --project unit packages/card-catalog`. The tests check key format, contrast and the vocabulary.

## Add a bank

Add the bank to `countries/<cc>/issuers.ts`, with every spelling people type for it as `aliases`. An alias only has to be unique within its country: "Citi" is UnionBank in the Philippines and Citibank elsewhere. Then add a products file and list it in `cards.ts`.

## Add a country

1. Create `countries/<cc>/` with `issuers.ts`, `products/` and `cards.ts`, following `countries/ph/`.
2. Register it in `countries.ts`: an entry in `CARD_COUNTRIES` and one in `LOADERS`.
3. Add it to `all.ts`.

If people in that country name their cards in a language other than English, list the filler words ("cartão", "Karte") as `nameStopWords` in `cards.ts`. Suggestions stay sharp that way.

## Rules

- **Keys are permanent.** Accounts store them. When a card is discontinued, set `status: "legacy"`. When a card is redesigned, update its `visual` and keep its key.
- **Stylised, not reproduced.** Use colours, textures and a bank's name as text. Leave out logos, scanned artwork and card numbers.
- **A new motif is for many cards, not one.** Propose one only when no existing motif comes close and at least two cards would use it. It takes three edits: add the name to `CARD_MOTIFS` here and to `CardMotifName` in `packages/ui/src/components/card-art/canvas.ts`; draw it in `packages/ui/src/components/card-art/motifs/<name>.tsx`; add it to the registry in `packages/ui/src/components/card-art/motifs.ts`. If you miss the registry, the build fails.

## Prompt

Paste this into your coding agent and fill in the brackets:

```
Add the [card name] credit card from [bank], [country] to Masdan's card catalog,
following packages/card-catalog/CONTRIBUTING.md.

1. On the bank's official site, confirm the exact card name, its network(s) and
   whether it is still issued. Keep the URL.
2. Look at the official card image. Describe its base colours, gradient
   direction, texture, focal element and where the bank name sits.
3. Map that description onto CARD_PATTERNS and CARD_MOTIFS in
   src/vocabulary.ts, choosing the nearest existing entries.
4. Add the product next to its bank's existing entries, with a new key.
5. Run the catalog tests until they pass.

Report the source URL, the look you chose, and anything you had to guess.
```
