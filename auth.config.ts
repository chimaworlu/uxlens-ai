import type { NextAuthConfig } from "next-auth";

// Edge-compatible slice of the full config: no Prisma adapter, no
// Credentials provider (its authorize() calls bcrypt, a Node-only native
// module). This is what runs in proxy.ts (Edge runtime) just to check for
// a valid session cookie — auth.ts extends this with the Node-only pieces
// for everywhere else that needs a real sign-in.
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/auth",
  },
  providers: [],
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
};
