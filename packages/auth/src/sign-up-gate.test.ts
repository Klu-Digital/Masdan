import { describe, expect, it } from "vite-plus/test";

import { signUpAllowed } from "./sign-up-gate";

describe("signUpAllowed", () => {
  it.each([
    [{ allowSignup: false, hasUsers: true, invitationPending: false }, false],
    [{ allowSignup: false, hasUsers: false, invitationPending: false }, true],
    [{ allowSignup: false, hasUsers: true, invitationPending: true }, true],
    [{ allowSignup: true, hasUsers: true, invitationPending: false }, true],
  ])("%o -> %s", (input, expected) => {
    expect(signUpAllowed(input)).toBe(expected);
  });
});
