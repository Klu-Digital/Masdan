import type { Database } from "@masdan/db";
import { log, parseError } from "@masdan/observability";

import { completeJson, isAiConfigured } from "../ai/gateway";
import { quickEntryHousehold } from "./quick-entry.parse";
import {
  receiptExtraction,
  receiptMessages,
  resolveReceiptEntry,
} from "./receipt-entry";
import type { ReceiptEntryResult } from "./receipt-entry";

const RECEIPT_AI_TIMEOUT_MS = 20_000;

export const sniffReceiptContentType = (
  bytes: Uint8Array
): "image/jpeg" | "image/png" | "image/webp" | null => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCodePoint(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCodePoint(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

export const parseReceiptEntry = async (
  db: Database,
  organizationId: string,
  image: { bytes: Uint8Array; contentType: string },
  caption: string | null
): Promise<{
  ai: "ok" | "failed" | "unavailable";
  result: ReceiptEntryResult | null;
}> => {
  if (!isAiConfigured("receipt")) {
    return { ai: "unavailable", result: null };
  }
  const household = await quickEntryHousehold(db, organizationId);
  try {
    const extraction = await completeJson({
      feature: "receipt",
      messages: receiptMessages(
        {
          base64: Buffer.from(image.bytes).toString("base64"),
          contentType: image.contentType,
        },
        caption,
        household
      ),
      name: "receipt_entry",
      schema: receiptExtraction,
      timeoutMs: RECEIPT_AI_TIMEOUT_MS,
    });
    return {
      ai: "ok",
      result: resolveReceiptEntry(extraction, caption, household),
    };
  } catch (error) {
    log.warn({ action: "receiptentry.ai.failed", ...parseError(error) });
    return { ai: "failed", result: null };
  }
};
