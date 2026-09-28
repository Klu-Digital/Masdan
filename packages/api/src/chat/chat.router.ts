import { chatChannels, chatLink, chatLinkCode } from "@masdan/db/schema/index";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requireFlag,
  requirePermission,
} from "../procedures";
import { chatChannelAdapters, configuredChatChannels } from "./chat.channels";
import { generateLinkCode, hashLinkCode, LINK_CODE_TTL_MS } from "./chat.link";

const ownLinks = (context: {
  organizationId: string;
  session: { user: { id: string } };
}) =>
  and(
    eq(chatLink.userId, context.session.user.id),
    eq(chatLink.organizationId, context.organizationId)
  );

/**
 * The caller's own chat-app links in the active household. Linking needs
 * `transaction:create`, the same permission every message is checked against;
 * unlinking needs nothing, so anyone can take their account back.
 */
export const chatRouter = {
  /**
   * Issues a single-use code bound to the active household, good on any
   * channel. Replaces any unused one.
   */
  createLinkCode: orgMutationProcedure
    .use(requireFlag("FF__CHAT_ENTRY"))
    .use(requirePermission({ transaction: ["create"] }))
    .use(rateLimit({ limit: 10, window: 60 }))
    .handler(async ({ context }) => {
      const code = generateLinkCode();
      const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
      const owner = {
        organizationId: context.organizationId,
        userId: context.session.user.id,
      };
      await context.db
        .delete(chatLinkCode)
        .where(
          and(
            eq(chatLinkCode.userId, owner.userId),
            eq(chatLinkCode.organizationId, owner.organizationId)
          )
        );
      await context.db
        .insert(chatLinkCode)
        .values({ ...owner, codeHash: hashLinkCode(code), expiresAt });
      return { code, expiresAt };
    }),

  /** Only configured channels are listed: an unconfigured one cannot be linked or used. */
  status: orgProcedure
    .use(requireFlag("FF__CHAT_ENTRY"))
    .handler(async ({ context }) => {
      const links = await context.db
        .select({
          channel: chatLink.channel,
          externalName: chatLink.externalName,
          linkedAt: chatLink.createdAt,
        })
        .from(chatLink)
        .where(ownLinks(context));
      return {
        channels: configuredChatChannels().map((channel) => {
          const link = links.find((row) => row.channel === channel);
          return {
            channel,
            label: chatChannelAdapters[channel].label,
            link: link
              ? { externalName: link.externalName, linkedAt: link.linkedAt }
              : null,
          };
        }),
      };
    }),

  unlink: orgMutationProcedure
    .use(requireFlag("FF__CHAT_ENTRY"))
    .input(z.object({ channel: z.enum(chatChannels) }))
    .handler(async ({ context, input }) => {
      const removed = await context.db
        .delete(chatLink)
        .where(and(ownLinks(context), eq(chatLink.channel, input.channel)))
        .returning({ id: chatLink.id });
      return { unlinked: removed.length > 0 };
    }),
};
