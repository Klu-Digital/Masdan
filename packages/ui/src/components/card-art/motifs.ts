import type {
  CardMotifName,
  Motif,
} from "@masdan/ui/components/card-art/canvas";
import { ArcLines } from "@masdan/ui/components/card-art/motifs/arc-lines";
import { Bolt } from "@masdan/ui/components/card-art/motifs/bolt";
import {
  Chevron,
  ChevronFramed,
} from "@masdan/ui/components/card-art/motifs/chevron";
import { ChevronStripes } from "@masdan/ui/components/card-art/motifs/chevron-stripes";
import { CoBrandStripe } from "@masdan/ui/components/card-art/motifs/co-brand-stripe";
import { Contours } from "@masdan/ui/components/card-art/motifs/contours";
import { DotField } from "@masdan/ui/components/card-art/motifs/dot-field";
import {
  Facets,
  FacetsLeft,
} from "@masdan/ui/components/card-art/motifs/facets";
import { Frame } from "@masdan/ui/components/card-art/motifs/frame";
import { Globe } from "@masdan/ui/components/card-art/motifs/globe";
import { HexRings } from "@masdan/ui/components/card-art/motifs/hex-rings";
import { Horizon, Planet } from "@masdan/ui/components/card-art/motifs/horizon";
import { Medallion } from "@masdan/ui/components/card-art/motifs/medallion";
import { Monogram } from "@masdan/ui/components/card-art/motifs/monogram";
import { Orbit } from "@masdan/ui/components/card-art/motifs/orbit";
import { OversizedLetter } from "@masdan/ui/components/card-art/motifs/oversized-letter";
import { Peaks } from "@masdan/ui/components/card-art/motifs/peaks";
import { RadialDots } from "@masdan/ui/components/card-art/motifs/radial-dots";
import { SRibbon } from "@masdan/ui/components/card-art/motifs/s-ribbon";
import { SideBand } from "@masdan/ui/components/card-art/motifs/side-band";
import { Silk } from "@masdan/ui/components/card-art/motifs/silk";
import { Skyline } from "@masdan/ui/components/card-art/motifs/skyline";
import { SpeedLines } from "@masdan/ui/components/card-art/motifs/speed-lines";
import { Sunburst } from "@masdan/ui/components/card-art/motifs/sunburst";
import { Sweep } from "@masdan/ui/components/card-art/motifs/sweep";
import { Tiles } from "@masdan/ui/components/card-art/motifs/tiles";
import { TravelSeal } from "@masdan/ui/components/card-art/motifs/travel-seal";
import { WaveRibbon } from "@masdan/ui/components/card-art/motifs/wave-ribbon";
import { WingStripe } from "@masdan/ui/components/card-art/motifs/wing-stripe";
import { Wordmark } from "@masdan/ui/components/card-art/motifs/wordmark";

/**
 * Every motif, by the name the card catalog uses. Adding a name to
 * `CardMotifName` without a drawing here fails to compile.
 */
export const MOTIFS: Record<CardMotifName, Motif> = {
  "arc-lines": ArcLines,
  bolt: Bolt,
  chevron: Chevron,
  "chevron-framed": ChevronFramed,
  "chevron-stripes": ChevronStripes,
  "co-brand-stripe": CoBrandStripe,
  contours: Contours,
  "dot-field": DotField,
  facets: Facets,
  "facets-left": FacetsLeft,
  frame: Frame,
  globe: Globe,
  "hex-rings": HexRings,
  horizon: Horizon,
  medallion: Medallion,
  monogram: Monogram,
  orbit: Orbit,
  "oversized-letter": OversizedLetter,
  peaks: Peaks,
  planet: Planet,
  "radial-dots": RadialDots,
  "s-ribbon": SRibbon,
  "side-band": SideBand,
  silk: Silk,
  skyline: Skyline,
  "speed-lines": SpeedLines,
  sunburst: Sunburst,
  sweep: Sweep,
  tiles: Tiles,
  "travel-seal": TravelSeal,
  "wave-ribbon": WaveRibbon,
  "wing-stripe": WingStripe,
  wordmark: Wordmark,
};
