// Shared between the marketing site's contact form (real-time inline
// errors) and /api/contact (server-side enforcement) — same "client never
// trusted alone" rule as lib/validation/auth.ts. The name field reuses
// validateFullName from there directly (same full-name requirement as
// sign-up, by explicit choice), so only the message check lives here.
export function validateContactMessage(value: string): string | null {
  if (value.trim().length > 5000) {
    return "Message Is Too Long";
  }
  return null;
}
