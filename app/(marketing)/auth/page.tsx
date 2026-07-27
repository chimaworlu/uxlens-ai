"use client";

import { Suspense, useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./auth.module.css";

type View = "sign-in" | "sign-up" | "verify-email";

const TITLE_COPY: Record<View, string> = {
  "sign-in": "Sign in — UXLens AI",
  "sign-up": "Sign up — UXLens AI",
  "verify-email": "Check your email — UXLens AI",
};

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const searchParams = useSearchParams();
  const initialView: View =
    searchParams.get("view") === "sign-up" ? "sign-up" : "sign-in";

  const [view, setView] = useState<View>(initialView);
  const [signUpEmail, setSignUpEmail] = useState("");

  useEffect(() => {
    document.title = TITLE_COPY[view];
  }, [view]);

  function handleSignUpSuccess(email: string) {
    setSignUpEmail(email);
    setView("verify-email");
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {view !== "verify-email" && <LogoLink />}
        {view === "sign-in" && <SignInCard onSwitchToSignUp={() => setView("sign-up")} />}
        {view === "sign-up" && (
          <SignUpCard
            onSwitchToSignIn={() => setView("sign-in")}
            onSuccess={handleSignUpSuccess}
          />
        )}
        {view === "verify-email" && (
          <VerifyEmailCard
            email={signUpEmail}
            onSignOut={() => setView("sign-in")}
          />
        )}
      </main>
    </div>
  );
}

function SignInCard({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!email.trim() || !password.trim()) return;
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Welcome back</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          Sign in to continue to your research
        </p>
      </div>

      <GoogleButton />
      <Divider />

      <form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          id="signin-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          forceShowError={submitAttempted}
        />

        <PasswordField
          id="signin-password"
          label="Password"
          value={password}
          onChange={setPassword}
          forceShowError={submitAttempted}
        />

        <Link
          href="/password-reset"
          className={`${styles.forgotLink} ds-label-medium ds-focus-ring`}
        >
          Forgot password?
        </Link>

        <button
          type="submit"
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          Sign in
        </button>
      </form>

      <p className={`${styles.footerText} ds-body-small`}>
        Don&apos;t have an account?{" "}
        <button
          type="button"
          className={`${styles.footerLink} ds-label-medium ds-focus-ring`}
          onClick={onSwitchToSignUp}
        >
          Sign up
        </button>
      </p>
    </div>
  );
}

function SignUpCard({
  onSwitchToSignIn,
  onSuccess,
}: {
  onSwitchToSignIn: () => void;
  onSuccess: (email: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const isFormValid =
    !validateFullName(fullName) && !validateEmail(email) && isPasswordValid(password);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!fullName.trim() || !email.trim() || !password.trim()) return;
    if (validateFullName(fullName)) return;
    if (validateEmail(email)) return;
    if (!isPasswordValid(password)) return;
    onSuccess(email);
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Create your account</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          Start turning your research into trusted findings
        </p>
      </div>

      <GoogleButton />
      <Divider />

      <form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          id="signup-name"
          label="Full name"
          value={fullName}
          onChange={setFullName}
          forceShowError={submitAttempted}
          validate={validateFullName}
        />

        <TextField
          id="signup-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          forceShowError={submitAttempted}
          validate={validateEmail}
        />

        <PasswordField
          id="signup-password"
          label="Password"
          value={password}
          onChange={setPassword}
          forceShowError={submitAttempted}
          showRequirements
        />

        <button
          type="submit"
          disabled={!isFormValid}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          Sign up
        </button>
      </form>

      <p className={`${styles.footerText} ds-body-small`}>
        Already have an account?{" "}
        <button
          type="button"
          className={`${styles.footerLink} ds-label-medium ds-focus-ring`}
          onClick={onSwitchToSignIn}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

function VerifyEmailCard({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  const displayEmail = email || "your email";

  return (
    <div className={styles.card}>
      <span className={styles.iconBadge}>
        <MailIcon />
      </span>

      <h1 className={`${styles.heading} ds-headline-small`}>Check your email</h1>

      <p className="ds-body-large">
        We&apos;ve sent a verification link to <strong>{displayEmail}</strong>.
        Click the link to verify your account.
      </p>
      <p className="ds-body-large">
        You can start uploading documents right away. You&apos;ll just need to
        verify your email before running your first analysis.
      </p>

      <button
        type="button"
        className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
      >
        Resend email
      </button>

      <p className={`${styles.footerText} ds-body-small`}>
        Wrong email?{" "}
        <button
          type="button"
          className={`${styles.footerLink} ds-label-medium ds-focus-ring`}
          onClick={onSignOut}
        >
          Sign out
        </button>{" "}
        and try again.
      </p>
    </div>
  );
}

function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  forceShowError,
  validate,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  forceShowError: boolean;
  /* Runs on every keystroke (not gated by blur/submit like the empty
     check below) — returns an error string to show immediately, or null.
     Only called once the field is non-empty, so it never fights with the
     empty-field message. */
  validate?: (value: string) => string | null;
}) {
  const [touched, setTouched] = useState(false);
  const isEmpty = value.trim() === "";
  const emptyError = (touched || forceShowError) && isEmpty;
  const formatError = !isEmpty && validate ? validate(value) : null;
  const errorMessage = emptyError
    ? `${label} field Cannot Be Empty`
    : formatError;
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className="ds-label-large">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          setTouched(true);
          onChange(trimTrailingSpaces(value));
        }}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? errorId : undefined}
        className="ds-focus-ring"
      />
      {errorMessage && (
        <span id={errorId} className={`${styles.errorText} ds-label-medium`} role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

function trimTrailingSpaces(value: string): string {
  return value.replace(/\s+$/, "");
}

function validateEmail(value: string): string | null {
  // Deliberately lenient, not full RFC validation: just needs *something*
  // before the @ and *something* after it. The error clears the instant a
  // domain starts (e.g. "jane@g"), it doesn't wait for a complete domain
  // or TLD like ".com" — matches "stop displaying the moment a domain is
  // typed after @", not "wait until the whole address is valid".
  const atIndex = value.indexOf("@");
  const hasLocalPart = atIndex > 0;
  const hasDomainStart = atIndex !== -1 && atIndex < value.length - 1;
  return hasLocalPart && hasDomainStart ? null : "Enter A Valid Email Address";
}

function validateFullName(value: string): string | null {
  // Letters and spaces only — spaces are allowed despite "only letters"
  // because a full name needs to fit more than one word (e.g. "Jane Doe").
  // Hyphens/apostrophes ("Mary-Jane", "O'Brien") are not currently
  // allowed; say if those should be permitted too.
  if (!/^[A-Za-z\s]+$/.test(value)) {
    return "Full Name Must Use Only Letters";
  }

  // At least a first and last word. filter(Boolean) collapses repeated/
  // trailing spaces so "Jane   " or "Jane  Doe" aren't miscounted. No
  // upper limit — a 3rd, 4th, or 5th word (middle names, compound
  // surnames) is just accepted as part of the same free-text value, same
  // as the schema stores it.
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return "Full Name Must Have At Least 2 Words";
  }

  return null;
}

const PASSWORD_REQUIREMENTS: { test: (value: string) => boolean; label: string }[] = [
  { test: (v) => v.length >= 8, label: "Minimum Of 8 Characters" },
  { test: (v) => /[a-z]/.test(v), label: "Password must contain a lowercase letter" },
  { test: (v) => /[A-Z]/.test(v), label: "Password must contain an uppercase letter" },
  { test: (v) => /[0-9]/.test(v), label: "Password must contain a number" },
  { test: (v) => /[#@>^]/.test(v), label: "Password must contain a special character(#@>^)" },
];

function getUnmetPasswordRequirements(value: string): string[] {
  return PASSWORD_REQUIREMENTS.filter((r) => !r.test(value)).map((r) => r.label);
}

function isPasswordValid(value: string): boolean {
  return getUnmetPasswordRequirements(value).length === 0;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  forceShowError,
  showRequirements = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  forceShowError: boolean;
  showRequirements?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const showError = (touched || forceShowError) && value.trim() === "";
  const errorId = `${id}-error`;
  const requirementsId = `${id}-requirements`;

  // Hidden while the field is empty (nothing typed yet), then only the
  // still-unmet requirements are listed — each one drops off the list
  // individually the moment it's satisfied, rather than the whole list
  // disappearing only once every requirement is met at once.
  const unmetRequirements =
    showRequirements && value.length > 0 ? getUnmetPasswordRequirements(value) : [];

  return (
    <div className={styles.field}>
      <label htmlFor={id} className="ds-label-large">
        {label}
      </label>
      <div className={styles.passwordInputWrap}>
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError}
          aria-describedby={
            [showError ? errorId : null, unmetRequirements.length ? requirementsId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className="ds-focus-ring"
        />
        <button
          type="button"
          className={`${styles.passwordToggle} ds-focus-ring`}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {showError && (
        <span id={errorId} className={`${styles.errorText} ds-label-medium`} role="alert">
          {label} field Cannot Be Empty
        </span>
      )}
      {unmetRequirements.length > 0 && (
        <ul id={requirementsId} className={styles.passwordRequirements} role="status">
          {unmetRequirements.map((requirement) => (
            <li key={requirement} className="ds-label-small">
              {requirement}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoogleButton() {
  return (
    <button
      type="button"
      className={`${styles.googleButton} ds-label-large ds-focus-ring`}
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

function Divider() {
  return <div className={`${styles.divider} ds-label-small`}>or</div>;
}

function LogoLink() {
  return (
    <Link
      href="/"
      className={`${styles.logoLink} ds-title-large ds-focus-ring`}
    >
      UXLens AI
    </Link>
  );
}


function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {open ? (
        <>
          <path
            d="M1.5 9s2.7-5.5 7.5-5.5S16.5 9 16.5 9s-2.7 5.5-7.5 5.5S1.5 9 1.5 9z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.4" />
        </>
      ) : (
        <>
          <path
            d="M2 2l14 14M7.4 7.6a2.25 2.25 0 0 0 3 3M4.6 4.9C2.9 6 1.5 9 1.5 9s2.7 5.5 7.5 5.5c1.3 0 2.4-.4 3.4-.9M11.9 3.8A8 8 0 0 1 16.5 9s-.6 1.3-1.8 2.6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
