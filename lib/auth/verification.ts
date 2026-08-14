import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
export async function createVerificationCode(email: string): Promise<string> {
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = generateVerificationCode();
    try {
      await prisma.verificationToken.create({
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
export async function peekVerificationCode(email: string, code: string): Promise<VerifyCodeResult> {
  const token = await prisma.verificationToken.findUnique({
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
export async function consumeVerificationCode(email: string, code: string): Promise<VerifyCodeResult> {
  const token = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: code } },
  });

  if (!token) {
    return "invalid";
  }

  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token: code } },
  });

  if (token.expires < new Date()) {
    return "expired";
  }

  return "verified";
}
