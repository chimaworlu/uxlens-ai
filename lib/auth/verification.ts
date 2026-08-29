import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

// Every function below accepts an optional Prisma client, defaulting to the
// shared singleton — lets callers compose them inside a `$transaction` (the
// presignup-verify and register routes both need that: consuming a code/
// token and writing its side effect must succeed or fail together, not as
// two independent calls that could leave a code spent with nothing to show
// for it).
type DbClient = typeof prisma | Prisma.TransactionClient;

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// Longer than a code's TTL: this token is issued once the user has already
// typed a correct code, and just needs to survive them finishing the rest
// of the sign-up form (name, password) before it's redeemed at register.
const PROOF_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// The one code-generation primitive for every verification code in the
// app (email verification and password reset alike): pull 32 random bytes
// from crypto.randomBytes, then fold that 256-bit value down to a 6-digit
// number via modulo, zero-padded so it's always exactly 6 digits (e.g.
// "004821"). The user-facing result is identical to Node's randomInt-based
// OTP — a short typed code — the difference is purely which primitive
// supplies the randomness underneath.
function generateVerificationCode(): string {
  const bytes = randomBytes(32);
  const num = BigInt("0x" + bytes.toString("hex")) % 1_000_000n;
  return num.toString().padStart(6, "0");
}

// Creates a fresh 6-digit code for this email, replacing any code already
// issued to them (VerificationToken.identifier + token together are unique,
// so a stale unexpired code can't linger and cause ambiguity about which
// one is "the" valid code). Returns the code so the caller can email it —
// this function itself never sends anything. Shared by both email
// verification and password reset — same generator, same TTL.
//
// `token` also carries its own standalone @unique constraint in the schema
// (global, not per-identifier), and a 6-digit code only has 1,000,000
// possible values — a collision between two different users' codes is rare
// per attempt but not negligible at scale, so this retries on that specific
// conflict rather than letting the request fail outright.
export async function createVerificationCode(email: string, db: DbClient = prisma): Promise<string> {
  await db.verificationToken.deleteMany({ where: { identifier: email } });

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = generateVerificationCode();
    try {
      await db.verificationToken.create({
        data: {
          identifier: email,
          token: code,
          expires: new Date(Date.now() + CODE_TTL_MS),
        },
      });
      return code;
    } catch (error) {
      const isUniqueConflict =
        error instanceof Error && "code" in error && error.code === "P2002";
      if (!isUniqueConflict || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      // Someone else already holds this exact code right now — try again.
    }
  }

  throw new Error("Could not generate a unique verification code.");
}

export type VerifyCodeResult = "verified" | "invalid" | "expired";

// This module is shared by two independent flows (email verification and
// password reset) that both need "is this code right" but do different
// things afterward — so this file only ever checks/consumes the code. It
// never touches User itself; each caller applies its own side effect
// (marking emailVerified, or hashing a new password) after getting
// "verified" back.

// Non-consuming: safe to call for immediate UI feedback (e.g. a "Verify
// code" button) without spending the code. The actual authorization
// boundary is consumeVerificationCode below, called again at the point
// where something irreversible actually happens — never trust a client's
// earlier "the peek said verified" on its own.
export async function peekVerificationCode(
  email: string,
  code: string,
  db: DbClient = prisma
): Promise<VerifyCodeResult> {
  const token = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: code } },
  });

  if (!token) {
    return "invalid";
  }
  if (token.expires < new Date()) {
    return "expired";
  }
  return "verified";
}

// Single-use: the token row is deleted whenever a matching code is found,
// whether it turned out to still be valid or had merely expired, so a
// given code can never be tried again either way.
export async function consumeVerificationCode(
  email: string,
  code: string,
  db: DbClient = prisma
): Promise<VerifyCodeResult> {
  const token = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: code } },
  });

  if (!token) {
    return "invalid";
  }

  await db.verificationToken.delete({
    where: { identifier_token: { identifier: email, token: code } },
  });

  if (token.expires < new Date()) {
    return "expired";
  }

  return "verified";
}

// ---------- pre-signup email proof ----------
// A second, unrelated use of the same VerificationToken table: once someone
// mid-signup (no account yet) enters a correct code from the pair above,
// this hands them a long opaque bearer token proving "this exact email was
// verified just now" — carried forward client-side and redeemed at
// register() so the new account can be created already-verified, without
// register() ever having to trust a bare client-asserted boolean.
//
// Namespaced under a "presignup-proof:" prefix (never a bare email) so it
// can never collide with, or get swept up by, the raw-email-keyed OTP code
// rows above — createVerificationCode's own cleanup only ever deletes rows
// whose identifier is exactly the raw email.
function presignupProofIdentifier(email: string): string {
  return `presignup-proof:${email}`;
}

function generateProofToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createEmailProofToken(email: string, db: DbClient = prisma): Promise<string> {
  const identifier = presignupProofIdentifier(email);
  await db.verificationToken.deleteMany({ where: { identifier } });

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const token = generateProofToken();
    try {
      await db.verificationToken.create({
        data: { identifier, token, expires: new Date(Date.now() + PROOF_TOKEN_TTL_MS) },
      });
      return token;
    } catch (error) {
      const isUniqueConflict =
        error instanceof Error && "code" in error && error.code === "P2002";
      if (!isUniqueConflict || attempt === MAX_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error("Could not generate a unique email verification token.");
}

// Single-use, same as consumeVerificationCode — returns false (rather than
// a three-way result) since the only caller, register(), treats "missing",
// "wrong", and "expired" identically: proceed with an unverified account
// either way, never a hard failure over a stale/absent token.
export async function consumeEmailProofToken(
  email: string,
  token: string,
  db: DbClient = prisma
): Promise<boolean> {
  const identifier = presignupProofIdentifier(email);
  const row = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier, token } },
  });
  if (!row) return false;

  await db.verificationToken.delete({ where: { identifier_token: { identifier, token } } });
  return row.expires >= new Date();
}
