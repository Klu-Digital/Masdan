import { z } from "zod";

/** A calendar date, `YYYY-MM-DD`: ledger dates carry no time or zone. */
export const isoDate = z.iso.date();
