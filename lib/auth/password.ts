import bcrypt from "bcrypt";

// Server-only — bcrypt is a native binding and must never be imported from
// client code. Cost factor 12 per explicit requirement.
const COST_FACTOR = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST_FACTOR);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
