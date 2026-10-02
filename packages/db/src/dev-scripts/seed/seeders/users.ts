import { eq, inArray, sql } from "drizzle-orm";

import { user } from "../../../schema/auth";
import { defineSeeder } from "../define";
import { seedFinances } from "./finances";

interface PlannedUser {
  email: string;
  password: string;
  name: string;
  /** Set on the row after sign-up — better-auth's sign-up API doesn't accept a role. */
  role?: string;
}

// `K1@gmail.com` uses its own address as its password.
const FIXED_USERS: PlannedUser[] = [
  {
    email: "K1@gmail.com",
    name: "K1",
    password: "K1@gmail.com",
    role: "admin",
  },
  { email: "member@masdan.dev", name: "Member", password: "password" },
];

/** Shared by every random user so at least one credential is easy to remember. */
const RANDOM_USER_PASSWORD = "password";

export interface UsersPlan {
  users: PlannedUser[];
}

export const usersSeeder = defineSeeder<UsersPlan>({
  async apply({ db, auth, faker, log }, { users }) {
    for (const planned of users) {
      const { user: created } = await auth.api.signUpEmail({
        body: {
          email: planned.email,
          name: planned.name,
          password: planned.password,
        },
      });

      if (planned.role) {
        await db
          .update(user)
          .set({ role: planned.role })
          .where(eq(user.id, created.id));
      }
      if (planned.email === "K1@gmail.com") {
        await seedFinances(db, created.id, faker);
      }

      log(
        `created ${planned.email}${planned.role ? ` (${planned.role})` : ""}`
      );
    }
  },

  async conflicts({ db }, { users }) {
    // better-auth lowercases email on sign-up, so "K1@gmail.com" would never
    // match the "k1@gmail.com" row it created.
    const emails = users.map((u) => u.email.toLowerCase());
    const existing = await db
      .select({ email: user.email })
      .from(user)
      .where(inArray(sql`lower(${user.email})`, emails));
    return existing.map((row) => `user ${row.email}`);
  },

  name: "users",

  plan({ faker, opts, log }) {
    const random: PlannedUser[] = Array.from({ length: opts.userCount }, () => {
      const name = faker.person.fullName();
      return {
        email: faker.internet
          .email({ firstName: name.split(" ")[0] })
          .toLowerCase(),
        name,
        password: RANDOM_USER_PASSWORD,
      };
    });

    const users = [...FIXED_USERS, ...random];
    log(
      `planned ${FIXED_USERS.length} fixed + ${random.length} random user(s)`
    );
    return { users };
  },
});
