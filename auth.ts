import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { enqueueWelcomeEmail } from "@/lib/queue/email";
import { authConfig } from "./auth.config";

const isProduction = process.env.NODE_ENV === "production";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // The Credentials provider cannot use database-backed sessions (Auth.js
  // constraint — a credentials sign-in isn't verified by the adapter the
  // way an OAuth callback is), so this must be "jwt". Google sign-in (once
  // configured) uses the same strategy for one consistent session model
  // across both providers.
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  // Explicit rather than relying on Auth.js's implicit defaults, so these
  // properties are guaranteed rather than just currently-true: httpOnly
  // blocks JS/XSS access to the cookie, sameSite: "lax" blocks it being
  // sent on cross-site requests (CSRF-adjacent hardening on top of the
  // dedicated CSRF token below), secure is on in production only (a
  // Secure-flagged cookie is dropped outright over plain HTTP, which
  // local dev still uses).
  cookies: {
    sessionToken: {
      name: isProduction ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
  },
  events: {
    // Fires exactly once, right after the adapter inserts a brand-new User
    // row — i.e. only for OAuth sign-ups (Google). The Credentials sign-up
    // path never touches the adapter's user-creation path (it goes through
    // app/api/auth/register, which sends its own welcome email), so this
    // can't double-send for that flow.
    async createUser({ user }) {
      if (!user.email) return;
      try {
        await enqueueWelcomeEmail(user.email, user.name ?? "there");
      } catch {
        // Best-effort, same as the register route's welcome email.
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    // Google's allowDangerousEmailAccountLinking (below) skips Auth.js's
    // own OAuthAccountNotLinked guard entirely, so this is the only check
    // standing between "any Google sign-in with a matching email gets in"
    // and a real account-takeover path: FR-2 lets a password account go on
    // being used before its email is verified, so without this, someone
    // could register a victim's email with a password they control and
    // silently inherit it the moment the real owner tries Google sign-in.
    // Requiring the existing account's email to already be verified closes
    // that hole while still linking automatically for the normal case
    // (an account that's actually been used and verified).
    //
    // Returning a URL string here (rather than throwing) is deliberate:
    // Auth.js only forwards a fixed whitelist of error types to the client
    // as-is (OAuthAccountNotLinked, AccessDenied, a handful of others) —
    // anything else, including a thrown custom AuthError subclass,
    // collapses into a generic "Configuration" error before it reaches
    // app/(marketing)/auth/page.tsx. Returning a string instead redirects
    // there directly, before any session or account link is created
    // (@auth/core's callback handler returns immediately once this
    // callback yields a string, never reaching the login/register step).
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.email) return true;

      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { emailVerified: true, accounts: { where: { provider: "google" }, select: { id: true } } },
      });

      // No existing account (brand-new email) or already linked to Google
      // from a previous sign-in — nothing extra to check here.
      if (!existing || existing.accounts.length > 0) return true;

      if (!existing.emailVerified) {
        return "/auth?error=GoogleLinkNeedsVerifiedEmail";
      }
      return true;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        // Same anti-enumeration shape whether the email doesn't exist or
        // the account has no password (e.g. Google-only signup): both
        // just fail authorize() the same way, no distinguishing response.
        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    // Renders as a disabled button with a dev note client-side until these
    // are set (FR-1) — registering the provider only when both are present
    // keeps an unconfigured Google sign-in from being a live, broken route.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Without this, Auth.js refuses to sign in via Google whenever
            // the email already belongs to an unlinked account, full stop
            // — the signIn callback above is what actually gates this
            // safely (verified-email-only), so this alone would be the
            // genuinely dangerous half of the pair.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
});
