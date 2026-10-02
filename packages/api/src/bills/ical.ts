import { addDays } from "../recurring/recurrence";

// All-day events only, so no VTIMEZONE is needed.

export interface CalendarEvent {
  /** `YYYY-MM-DD`. */
  date: string;
  description: string;
  summary: string;
  uid: string;
}

const MAX_LINE_OCTETS = 75;

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped. */
export const escapeText = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r\n|\r|\n/gu, "\\n");

const encoder = new TextEncoder();

// Splits on code points, so a multi-byte character is never cut.
export const foldLine = (line: string): string => {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    // Continuation lines spend one octet on their leading space.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += character;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
};

const compactDate = (iso: string): string => iso.replaceAll("-", "");

const utcStamp = (now: Date): string =>
  `${now.toISOString().slice(0, 19).replaceAll(/[-:]/gu, "")}Z`;

export const renderCalendar = (
  name: string,
  events: readonly CalendarEvent[],
  now: Date
): string => {
  const stamp = utcStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Masdan//Bill calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};
