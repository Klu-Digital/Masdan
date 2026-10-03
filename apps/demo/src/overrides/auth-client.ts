import type { authClient as realAuthClient } from "@/lib/auth-client";

import { db, resetDemo } from "../backend/store";

type AuthClient = typeof realAuthClient;
type Data<T extends (...args: never[]) => unknown> = NonNullable<
  Awaited<ReturnType<T>> extends { data: infer D } ? D : never
>;
type SessionData = Data<AuthClient["getSession"]>;
type FullOrganization = Data<AuthClient["organization"]["getFullOrganization"]>;

export const DEMO_EMAIL = "demo@masdan.app";
export const DEMO_PASSWORD = "masdan-demo";

const SIGNED_IN_KEY = "masdan-demo:signed-in";
const PARTNER = {
  email: "jamie@masdan.app",
  id: "00000000-0000-4000-8000-0000000fffff",
  memberId: "00000000-0000-4000-8000-0000000ffffe",
  name: "Jamie Reyes",
};

// Only "signed in" survives a reload; the household is rebuilt every time.
const readSignedIn = (): boolean => {
  try {
    return sessionStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
};

const writeSignedIn = (value: boolean): void => {
  try {
    if (value) {
      sessionStorage.setItem(SIGNED_IN_KEY, "1");
    } else {
      sessionStorage.removeItem(SIGNED_IN_KEY);
    }
  } catch {
    // Private mode: the session simply ends with the tab.
  }
};

let signedIn = readSignedIn();

const ok = <T>(data: T) => Promise.resolve({ data, error: null });

const refused = (
  message = "That needs the Masdan server, so it’s off in the demo."
) => ({
  data: null,
  error: { code: "DEMO", message, status: 403, statusText: "Forbidden" },
});

const session = (): SessionData => {
  const { household, user } = db();
  const expiresAt = new Date(Date.now() + 86_400_000);
  return {
    session: {
      activeOrganizationId: household.id,
      createdAt: household.createdAt,
      expiresAt,
      id: "00000000-0000-4000-8000-0000000ffffd",
      impersonatedBy: null,
      ipAddress: null,
      token: "demo",
      updatedAt: new Date(),
      userAgent: null,
      userId: user.id,
    },
    user: {
      banExpires: null,
      banReason: null,
      banned: false,
      createdAt: household.createdAt,
      email: user.email,
      emailVerified: true,
      id: user.id,
      image: user.image,
      name: user.name,
      role: "user",
      updatedAt: new Date(),
    },
  } as SessionData;
};

const organizationSummary = () => {
  const { household } = db();
  return {
    createdAt: household.createdAt,
    id: household.id,
    logo: null,
    metadata: null,
    name: household.name,
    slug: household.slug,
  };
};

const fullOrganization = (): FullOrganization => {
  const { household, user } = db();
  return {
    ...organizationSummary(),
    invitations: [],
    members: [
      {
        createdAt: household.createdAt,
        id: household.memberId,
        organizationId: household.id,
        role: "owner",
        user: {
          email: user.email,
          id: user.id,
          image: user.image,
          name: user.name,
        },
        userId: user.id,
      },
      {
        createdAt: household.createdAt,
        id: PARTNER.memberId,
        organizationId: household.id,
        role: "member",
        user: {
          email: PARTNER.email,
          id: PARTNER.id,
          image: null,
          name: PARTNER.name,
        },
        userId: PARTNER.id,
      },
    ],
  } as FullOrganization;
};

interface Callbacks {
  onError?: (context: {
    error: ReturnType<typeof refused>["error"];
  }) => unknown;
  onSuccess?: (context: { data: unknown }) => unknown;
}

const signIn = async (
  credentials: { email: string; password: string },
  callbacks: Callbacks = {}
) => {
  if (
    credentials.email !== DEMO_EMAIL ||
    credentials.password !== DEMO_PASSWORD
  ) {
    const result = refused("Use the demo account to sign in.");
    await callbacks.onError?.({ error: result.error });
    return result;
  }
  signedIn = true;
  writeSignedIn(true);
  const data = session();
  await callbacks.onSuccess?.({ data });
  return ok(data);
};

const refuse = () => Promise.resolve(refused());

const demoAuthClient = {
  admin: new Proxy({}, { get: () => refuse }),
  getSession: () => ok(signedIn ? session() : null),
  organization: {
    cancelInvitation: refuse,
    create: refuse,
    getFullOrganization: () => ok(fullOrganization()),
    inviteMember: refuse,
    list: () => ok([organizationSummary()]),
    setActive: () => ok(organizationSummary()),
    update: ({ data }: { data: { name?: string } }) => {
      if (data.name) {
        db().household.name = data.name;
      }
      return ok(organizationSummary());
    },
  },
  requestPasswordReset: refuse,
  resetPassword: refuse,
  signIn: { email: signIn },
  signOut: () => {
    signedIn = false;
    writeSignedIn(false);
    resetDemo();
    return ok({ success: true });
  },
  signUp: { email: refuse },
  updateUser: (values: { image?: string | null; name?: string }) => {
    Object.assign(db().user, values);
    return ok({ status: true });
  },
};

// Only the calls the web app makes exist; anything else fails loudly in dev.
export const authClient = demoAuthClient as unknown as AuthClient;
