---
status: accepted
---

# Masdan sends no email; recovery is admin-driven

Masdan is self-hosted and open source, so there is no mail server to assume and no `EMAIL_*` configuration to ask every hoster for. Password recovery, email verification and invitations therefore never depend on delivering a message. The person running the server, with shell access, is the root of trust — the same pattern Immich, Nextcloud, Gitea and Vaultwarden use.

- **Recovery.** A platform admin resets a password from `/admin/users/<id>`, which yields a one-time link to hand over out of band. A locked-out lone admin runs `pnpm admin:reset-password <email>`, also inside the server container. Both revoke the account's sessions. better-auth's forgot-password flow remains as a fallback that writes the link to raw stdout via `deliver()`.
- **No email verification.** Nothing can send the verification, so there is none, and no screen pretends otherwise.
- **Invite-only sign-up.** After the first account, which bootstraps the instance and becomes platform admin, only a holder of an invitation link can register. `ALLOW_SIGNUP=true` opens it.
- **Invitations are bearer links.** They are never matched by email address: with open sign-up, anyone could register as an invitee's address and read that household's finances.
- **Reset URLs never reach the structured logger.** `log` drains to PostHog when `POSTHOG_PROJECT_API_KEY` is set, so a logged reset URL is an account takeover handed to a third party. Links point straight at the web page, because better-auth's `/api/auth/reset-password/<token>` redirect puts the token in a path the request logger records.

## Considered options

- **Optional SMTP.** Rejected for now: it is one more service to configure, and self-service reset by email is the account-takeover path the design above avoids. `deliver()` is the single place it would slot in later.
- **Open sign-up with email-matched invitations** (better-auth's default). Rejected for the reason above.
