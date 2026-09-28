#!/usr/bin/env node
/**
 * Points Telegram at the public webhook, or shows where it points now:
 *
 *   pnpm telegram:webhook set https://bot.example.com
 *   pnpm telegram:webhook info
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from apps/server/.env
 * (or the shell). The URL is the public ingress origin, not the private API.
 */
import { existsSync } from "node:fs";

const WEBHOOK_PATH = "/chat/telegram/webhook";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set (apps/server/.env or the shell)`);
  }
  return value;
};

const callTelegram = async (
  method: string,
  body: Record<string, unknown> = {}
): Promise<unknown> => {
  const token = required("TELEGRAM_BOT_TOKEN");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  const json = (await response.json()) as {
    description?: string;
    ok: boolean;
    result?: unknown;
  };
  if (!json.ok) {
    throw new Error(`${method} failed: ${json.description ?? response.status}`);
  }
  return json.result;
};

const [command, origin] = process.argv.slice(2);

if (command === "set" && origin) {
  const url = new URL(WEBHOOK_PATH, origin);
  if (url.protocol !== "https:") {
    throw new Error("Telegram only delivers webhooks over https");
  }
  await callTelegram("setWebhook", {
    // Only messages: edits, channel posts and the rest never reach Masdan.
    allowed_updates: ["message"],
    secret_token: required("TELEGRAM_WEBHOOK_SECRET"),
    url: url.toString(),
  });
  process.stdout.write(`Webhook set to ${url.toString()}\n`);
} else if (command === "info") {
  process.stdout.write(
    `${JSON.stringify(await callTelegram("getWebhookInfo"), null, 2)}\n`
  );
} else {
  process.stderr.write(
    "Usage: pnpm telegram:webhook set <https-origin> | pnpm telegram:webhook info\n"
  );
  process.exitCode = 1;
}
