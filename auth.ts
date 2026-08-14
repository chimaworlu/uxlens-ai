import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";

const isProduction = process.env.NODE_ENV === "production";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const { handlers, auth, signIn, signOut } = NextAuth({
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
  pages: {
    signIn: "/auth",
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
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
