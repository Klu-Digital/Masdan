import { describe, expect, it } from "vite-plus/test";

import { escapeText, foldLine, renderCalendar } from "./ical";

describe("escapeText", () => {
  it("escapes the characters RFC 5545 reserves", () => {
    expect(escapeText("Rent; utilities, and\\more\nnext")).toBe(
      "Rent\\; utilities\\, and\\\\more\\nnext"
    );
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Rent due")).toBe("SUMMARY:Rent due");
  });

  it("folds at 75 octets without splitting a multi-byte character", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    const encoder = new TextEncoder();
    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replaceAll("\r\n ", "")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});

describe("renderCalendar", () => {
  it("writes all-day events with CRLF line endings", () => {
    const text = renderCalendar(
      "Masdan bills",
      [
        {
          date: "2026-12-31",
          description: "Due",
          summary: "Rent due",
          uid: "recurring-abc-2026-12-31@masdan",
        },
      ],
      new Date("2026-09-28T07:05:09.123Z")
    );
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.split("\r\n")).toEqual(
      expect.arrayContaining([
        "BEGIN:VEVENT",
        "DTSTAMP:20260928T070509Z",
        "DTSTART;VALUE=DATE:20261231",
        "DTEND;VALUE=DATE:20270101",
        "SUMMARY:Rent due",
      ])
    );
  });
});
