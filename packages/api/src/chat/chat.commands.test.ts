import { describe, expect, it } from "vite-plus/test";

import { normalizeLinkCode, readChatCommand } from "./chat.commands";
import { generateLinkCode, hashLinkCode } from "./chat.link";
import { chatReplies, quickEntryLink } from "./chat.replies";

describe("readChatCommand", () => {
  it("reads plain text as an entry", () => {
    expect(readChatCommand("dinner at jollibee 400")).toEqual({
      text: "dinner at jollibee 400",
      type: "entry",
    });
  });

  it("reads a leading slash that isn't a command as an entry", () => {
    expect(readChatCommand("/100 lunch")).toEqual({
      text: "/100 lunch",
      type: "entry",
    });
  });

  it.each([
    ["/link ABCD-EFGH", "ABCDEFGH"],
    ["/link abcd efgh", "ABCDEFGH"],
    ["/link@MasdanBot ABCD-EFGH", "ABCDEFGH"],
    ["/LINK abcdefgh", "ABCDEFGH"],
  ])("routes %s to linking", (text, code) => {
    expect(readChatCommand(text)).toEqual({ code, type: "link" });
  });

  it("caps a pasted wall of text after /link at a length the job accepts", () => {
    expect(readChatCommand(`/link ${"x".repeat(500)}`)).toEqual({
      code: "X".repeat(64),
      type: "link",
    });
  });

  it.each(["/start", "/help", "/link", "/link   ", "/unknown thing"])(
    "answers %s with help",
    (text) => {
      expect(readChatCommand(text)).toEqual({ type: "help" });
    }
  );
});

describe("link codes", () => {
  it("are eight unambiguous characters shown in two halves", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateLinkCode()).toMatch(
        /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u
      );
    }
  });

  it("hash the same however they are retyped", () => {
    expect(hashLinkCode("abcd efgh")).toBe(hashLinkCode("ABCD-EFGH"));
    expect(normalizeLinkCode(" ab-cd ef gh ")).toBe("ABCDEFGH");
    expect(hashLinkCode("ABCD-EFGH")).not.toContain("ABCD");
  });
});

describe("chatReplies", () => {
  it("confirms a creation with the amount in the account's currency", () => {
    expect(
      chatReplies.created({
        accountName: "Metrobank MC",
        amount: "400",
        currencyCode: "PHP",
        kind: "expense",
        notes: "dinner at Jollibee",
      })
    ).toBe("Added ₱400 expense\nDinner at Jollibee\nMetrobank MC");
    expect(
      chatReplies.created({
        accountName: "BPI Savings",
        amount: "1250.5",
        currencyCode: "PHP",
        kind: "income",
        notes: null,
      })
    ).toBe("Added ₱1,250.50 income\nBPI Savings");
  });

  it("confirms zero- and three-decimal currencies without float rounding", () => {
    expect(
      chatReplies.created({
        accountName: "Yen account",
        amount: "1234.000000",
        currencyCode: "JPY",
        kind: "expense",
        notes: null,
      })
    ).toBe("Added ¥1,234 expense\nYen account");
    expect(
      chatReplies.created({
        accountName: "Dinar account",
        amount: "1.234000",
        currencyCode: "KWD",
        kind: "income",
        notes: null,
      })
    ).toBe("Added KWD 1.234 income\nDinar account");
  });

  it("lists each issue once, then the link", () => {
    expect(
      chatReplies.needsReview(
        ["Choose a category", "Choose a category", "Which account?"],
        "https://masdan.example/transactions?quickEntry=x"
      )
    ).toBe(
      "Nothing was added yet:\n• Choose a category\n• Which account?\n\nFinish it in Masdan: https://masdan.example/transactions?quickEntry=x"
    );
  });

  it("links back to quick entry with the text encoded, or not at all", () => {
    expect(
      quickEntryLink("https://masdan.example", "dinner & drinks 400 #bdo")
    ).toBe(
      "https://masdan.example/transactions?quickEntry=dinner+%26+drinks+400+%23bdo"
    );
    expect(quickEntryLink(null, "dinner 400")).toBeNull();
  });
});
