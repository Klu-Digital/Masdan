import type {
  CardMotifName,
  Motif,
} from "@/components/finance/card-art/canvas";
import { ArcLines } from "@/components/finance/card-art/motifs/arc-lines";
import { Bolt } from "@/components/finance/card-art/motifs/bolt";
import {
  Chevron,
  ChevronFramed,
} from "@/components/finance/card-art/motifs/chevron";
import { ChevronStripes } from "@/components/finance/card-art/motifs/chevron-stripes";
import { CoBrandStripe } from "@/components/finance/card-art/motifs/co-brand-stripe";
import { Contours } from "@/components/finance/card-art/motifs/contours";
import { DotField } from "@/components/finance/card-art/motifs/dot-field";
import {
  Facets,
  FacetsLeft,
} from "@/components/finance/card-art/motifs/facets";
import { Frame } from "@/components/finance/card-art/motifs/frame";
import { Globe } from "@/components/finance/card-art/motifs/globe";
import { HexRings } from "@/components/finance/card-art/motifs/hex-rings";
import { Horizon, Planet } from "@/components/finance/card-art/motifs/horizon";
import { Medallion } from "@/components/finance/card-art/motifs/medallion";
import { Monogram } from "@/components/finance/card-art/motifs/monogram";
import { Orbit } from "@/components/finance/card-art/motifs/orbit";
import { OversizedLetter } from "@/components/finance/card-art/motifs/oversized-letter";
import { Peaks } from "@/components/finance/card-art/motifs/peaks";
import { RadialDots } from "@/components/finance/card-art/motifs/radial-dots";
import { SRibbon } from "@/components/finance/card-art/motifs/s-ribbon";
import { SideBand } from "@/components/finance/card-art/motifs/side-band";
import { Silk } from "@/components/finance/card-art/motifs/silk";
import { Skyline } from "@/components/finance/card-art/motifs/skyline";
import { SpeedLines } from "@/components/finance/card-art/motifs/speed-lines";
import { Sunburst } from "@/components/finance/card-art/motifs/sunburst";
import { Sweep } from "@/components/finance/card-art/motifs/sweep";
import { Tiles } from "@/components/finance/card-art/motifs/tiles";
import { TravelSeal } from "@/components/finance/card-art/motifs/travel-seal";
import { WaveRibbon } from "@/components/finance/card-art/motifs/wave-ribbon";
import { WingStripe } from "@/components/finance/card-art/motifs/wing-stripe";
import {
  Wordmark,
  WordmarkLeft,
} from "@/components/finance/card-art/motifs/wordmark";

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
  "wordmark-left": WordmarkLeft,
};
