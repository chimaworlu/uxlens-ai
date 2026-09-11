// Shared between the client-side sign-up form (real-time inline errors) and
// the /api/auth/register route (server-side enforcement). One source of
// truth so client and server can never drift apart on what counts as valid
// — the client never trusted alone per this project's rules.

export function validateEmail(value: string): string | null {
  // Deliberately lenient, not full RFC validation: just needs *something*
  // before the @ and *something* after it.
  const atIndex = value.indexOf("@");
  const hasLocalPart = atIndex > 0;
  const hasDomainStart = atIndex !== -1 && atIndex < value.length - 1;
  return hasLocalPart && hasDomainStart ? null : "Enter A Valid Email Address";
}

export function validateFullName(value: string): string | null {
  // Letters and spaces only — spaces are allowed despite "only letters"
  // because a full name needs to fit more than one word (e.g. "Jane Doe").
  if (!/^[A-Za-z\s]+$/.test(value)) {
    return "Full Name Must Use Only Letters";
  }

  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return "Full Name Must Have At Least 2 Words";
  }

  return null;
}

export const PASSWORD_REQUIREMENTS: { test: (value: string) => boolean; label: string }[] = [
  { test: (v) => v.length >= 8, label: "Minimum Of 8 Characters" },
  { test: (v) => /[a-z]/.test(v), label: "Password must contain a lowercase letter" },
  { test: (v) => /[A-Z]/.test(v), label: "Password must contain an uppercase letter" },
  { test: (v) => /[0-9]/.test(v), label: "Password must contain a number" },
  { test: (v) => /[#@>^]/.test(v), label: "Password must contain a special character(#@>^)" },
];

export function getUnmetPasswordRequirements(value: string): string[] {
  return PASSWORD_REQUIREMENTS.filter((r) => !r.test(value)).map((r) => r.label);
}

export function isPasswordValid(value: string): boolean {
  return getUnmetPasswordRequirements(value).length === 0;
}
