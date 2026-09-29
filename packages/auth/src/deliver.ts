export interface Delivery {
  body: string;
  subject: string;
  to: string;
}

/**
 * The one place a message leaves Masdan. Raw stdout, never `log`: structured
 * logs drain to PostHog, and a reset link there is an account takeover.
 */
export const deliver = (message: Delivery): Promise<void> => {
  process.stdout.write(
    `\n[masdan] ${message.subject} for ${message.to}\n${message.body}\n\n`
  );
  return Promise.resolve();
};
