import { auth } from "@/auth";

// Every authenticated route reads identity from here instead of trusting a
// client-supplied email — the session cookie is the only thing that
// actually proves who's asking. Returns null (never throws) so call sites
// can respond 401 the same way they'd handle any other "not signed in" case.
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
