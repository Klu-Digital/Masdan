#!/usr/bin/env node
// Must run before the imports below: `@masdan/auth` reads env at module scope.
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { loadEnv, runLifecycle } from "../bootstrap";

const USAGE = `Usage:
  pnpm admin:reset-password <email>

Sets a new password for the account and signs it out everywhere. Masdan sends no
email, so this is the recovery path when no other platform admin can issue a
reset link from /admin/users, including a locked-out lone admin.

On a terminal it prompts for the password (leave it empty to generate one).
Without one, e.g. \`docker exec\` without -t, it generates a password and prints
it once.

Inside the server image (Dokploy's terminal or \`docker exec\`), the same
command runs the bundled copy.
`;

const generatePassword = (): string => randomBytes(18).toString("base64url");

/** Reads one line with echo off: the prompt is written, keystrokes are not. */
const promptHidden = async (question: string): Promise<string> => {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) {
        process.stdout.write(chunk);
      }
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = true;
  try {
    return await answer;
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
};

/** `null` when the two entries differ. */
const choosePassword = async (): Promise<{
  generated: boolean;
  password: string;
} | null> => {
  if (!process.stdin.isTTY) {
    return { generated: true, password: generatePassword() };
  }
  const first = await promptHidden("New password (empty to generate): ");
  if (!first) {
    return { generated: true, password: generatePassword() };
  }
  const second = await promptHidden("Repeat it: ");
  return first === second ? { generated: false, password: first } : null;
};

const main = async (): Promise<void> => {
  loadEnv();

  const argv = process.argv.slice(2);
  // Both `pnpm run` and `vp run` forward the "--" literally.
  while (argv[0] === "--") {
    argv.shift();
  }

  const [email] = argv;
  if (!email) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const chosen = await choosePassword();
  if (!chosen) {
    console.error("Passwords did not match.");
    process.exitCode = 1;
    return;
  }

  const { setPasswordByEmail } = await import("@masdan/auth/recovery");

  // No pool to end: auth owns its connection, and runLifecycle exits.
  await runLifecycle(
    async () => {
      const result = await setPasswordByEmail(email, chosen.password);

      if (result.status === "no-user") {
        console.error(`No user found with email "${email}".`);
        return 1;
      }
      if (result.status === "no-password-login") {
        console.error(`${email} has no password login to reset.`);
        return 1;
      }

      console.log(
        `Reset the password for ${result.user.email} (${result.user.id}) and signed out all of its sessions.`
      );
      if (chosen.generated) {
        // Printed once, here, and nowhere else.
        console.log(`New password: ${chosen.password}`);
      }
      return 0;
    },
    () => Promise.resolve()
  );
};

main();
