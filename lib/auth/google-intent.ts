// Google OAuth carries no concept of "the visitor clicked Sign up" vs
// "the visitor clicked Sign in" — both buttons start the exact same
// authorization request, so the app has no way to tell them apart once
// Google redirects back, unless it tracks that intent itself. This cookie
// is that tracking: GoogleButton (app/(marketing)/auth/page.tsx) sets it
// right before redirecting to Google, and auth.ts's signIn callback reads
// it to enforce "Sign in" only logs into an existing account and "Sign up"
// only creates a new one, rather than both silently doing either.
export const GOOGLE_INTENT_COOKIE = "oauth_intent";
export type GoogleIntent = "sign-in" | "sign-up";
