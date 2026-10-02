# Chat entry

A linked user can add a transaction by messaging Masdan from a chat app, e.g. `dinner at jollibee 400 metrobank mc`. Telegram is the first channel. Chat entry does no parsing of its own: it runs the same quick-entry pipeline as the web (`parseQuickEntryText`) and creates through `createTransaction`, so validation, entity resolution and household scoping are shared.

```text
chat app -> public ingress (/chat/<channel>/webhook only)
         -> apps/server: adapter verifies + reads -> receiveChatMessage: rate-limit, record, enqueue
         -> apps/workers: processChatMessage (link | parse + create) -> adapter.send(reply)
```

Telegram also accepts receipt photos and JPEG/PNG/WebP image documents. This needs a vision-capable `RECEIPT_AI_MODEL` and storage configured on the workers; the optional caption supplies the payment account (e.g. `metrobank mc`). PDFs are not supported. Nothing is created or stored unless the receipt resolves completely and unambiguously.

Everything in this folder is channel-neutral: commands, link codes, replies, the receive half, the processor and the settings router. A channel is an adapter (`chat.channel.ts`) that owns only what differs: verifying its webhook, reading its payload into an `InboundChatMessage`, answering in its format, and sending a reply.

Turning it on for an instance is in [docs/self-hosting.md](../../../../docs/self-hosting.md#chat-entry-telegram).

## Adding a channel (WhatsApp, Discord, …)

1. Add its name to `chatChannels` in `packages/db/src/schema/chat.ts`. The columns are plain text, so no migration is needed.
2. Write `channels/<name>.ts` implementing `ChatChannelAdapter`, and register it in `chat.channels.ts`. The registry's mapped type makes a missing adapter a compile error.
3. Add its credentials to `packages/env/src/integrations.ts`, both `.env.example` files and the secrets manifest. `isConfigured()` reads them. Until they are set, the channel answers 404 and is not offered in settings.

## Things that bite

- **Adapters get the raw `Request`**, not parsed JSON. WhatsApp verifies with a GET handshake and an HMAC over the exact body, and Discord with an Ed25519 signature over it. The route accepts every method for the same reason.
- **Answer success for anything that isn't a rejection.** Channels redeliver on other statuses, Telegram indefinitely. Flag-off and ignored messages still get 200.
- **Link codes are 40 bits, so the limits on `/link` are what stop guessing.** Per 10-minute code lifetime: 5 attempts per chat account and 3 per code across all senders. There is deliberately no instance-wide ceiling: a dozen accounts could fill one and lock everyone out of linking, and 40 bits already defeat a crowd (10,000 accounts at 5 guesses would need centuries to hit one live code). They are checked in `receiveChatMessage` before anything is enqueued.
- **Replies that need no worker come back as a `reply` receipt**: help, rate limits, "try again". Telegram returns them in the webhook response body. A channel without that facility must send them itself.
- **A link binds one chat account to one user in one household**, whichever household was active when the code was made, per channel. Membership and `transaction:create` are re-checked on every message, so a removed or demoted member stops posting at once.
- **External ids are text.** Discord snowflakes overflow a JS number.
- **Chat entry only creates when the AI parse succeeded and the result is complete.** Anything missing or ambiguous, or any AI failure, gets the issues back plus a `/transactions?quickEntry=…` link. That link reruns quick entry and always opens the prefilled form, so following a link never creates.
- **`chat_inbound_message` makes delivery idempotent twice over.** Its `(channel, message_id)` key drops a channel's retries. `processed_at`, claimed in the same transaction as the write, makes a retried job a no-op. That is also why the reply is best-effort: a failed send is logged (`chat.reply.failed`), not retried.
- Message text is never logged. It is stored only in the queued job's payload.
