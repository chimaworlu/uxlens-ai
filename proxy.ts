import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// A separate, edge-compatible NextAuth instance built only from the
// provider-less config — this runs on every matched request in the Edge
// runtime, which can't load the Prisma adapter or bcrypt (see auth.config.ts).
// JWT sessions don't need either just to check "is there a valid cookie".
const { auth } = NextAuth(authConfig);

// Every route under app/(app) needs a real signed-in user — the pages
// themselves no longer carry an email query param to prove identity, so
// this is what actually keeps a signed-out visitor out, not just a UX nicety.
export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/auth", req.nextUrl.origin);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/projects/:path*", "/onboarding/:path*", "/account/:path*", "/settings/:path*"],
};
