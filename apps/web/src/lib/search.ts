import { z } from "zod";

const ignoredSearchValue = z.unknown().transform((): undefined => undefined);

export const optionalSearchString = z
  .string()
  .optional()
  .or(ignoredSearchValue)
  .optional();

export const monthSearch = z.object({
  month: z
    .string()
    .regex(/^[12]\d{3}-(?:0[1-9]|1[0-2])$/u)
    .optional()
    .or(ignoredSearchValue)
    .optional(),
});
