import { faker } from "@faker-js/faker";
import { auth } from "@k22i/auth";

export interface SignUpTestUserOverrides {
  name?: string;
  email?: string;
  password?: string;
}

export interface SignedUpTestUser {
  /** The created user, as returned by `auth.api.signUpEmail`. */
  user: Awaited<ReturnType<typeof auth.api.signUpEmail>>["user"];
  /** Carries the session cookie, ready for `createApp().request(path, { headers })`. */
  headers: Headers;
}

/**
 * Signs up through the real endpoint rather than inserting rows, so
 * better-auth's `databaseHooks` fire — in particular `user.create.after`, which
 * creates the personal organization. `returnHeaders: true` is what surfaces the
 * `Set-Cookie` written during sign-up.
 */
export const signUpTestUser = async (
  overrides: SignUpTestUserOverrides = {}
): Promise<SignedUpTestUser> => {
  const { headers: responseHeaders, response } = await auth.api.signUpEmail({
    body: {
      email: overrides.email ?? faker.internet.email().toLowerCase(),
      name: overrides.name ?? faker.person.fullName(),
      password: overrides.password ?? faker.internet.password({ length: 16 }),
    },
    returnHeaders: true,
  });

  // Every `Set-Cookie` folded into one `Cookie` request header, attributes dropped.
  const cookie = responseHeaders
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");

  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }

  return { headers, user: response.user };
};

/** Thin wrapper over `auth.api.getSession`. */
export const getSessionFor = (
  headers: Headers
): ReturnType<typeof auth.api.getSession> => auth.api.getSession({ headers });
