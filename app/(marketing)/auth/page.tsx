"use client";

import { Suspense, useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  validateEmail,
  validateFullName,
  isPasswordValid,
  getUnmetPasswordRequirements,
} from "@/lib/validation/auth";
import styles from "./auth.module.css";

type View =
  | "sign-in"
  | "sign-up"
  | "reset-request"
  | "reset-verify"
  | "reset-new-password";

const TITLE_COPY: Record<View, string> = {
  "sign-in": "Sign in — UXLens AI",
  "sign-up": "Sign up — UXLens AI",
  "reset-request": "Reset your password — UXLens AI",
  "reset-verify": "Enter reset code — UXLens AI",
  "reset-new-password": "Set a new password — UXLens AI",
};

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView: View =
    searchParams.get("view") === "sign-up" ? "sign-up" : "sign-in";

  const [view, setView] = useState<View>(initialView);
  // Single source of truth for the email across every view in this flow —
  // sign-in, sign-up, and all three reset steps all read from and write to
  // this one value, so whatever's typed anywhere carries forward no matter
  // which way the user navigates between them.
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");

  useEffect(() => {
    document.title = TITLE_COPY[view];
  }, [view]);

  function handleSignUpSuccess() {
    // No blocking verify-pending screen (FR-2: verification doesn't gate
    // app use, only analysis) — straight through to onboarding, where the
    // dashboard picks up the non-blocking verify banner instead.
    router.push(`/onboarding?email=${encodeURIComponent(email)}`);
  }

  function handleResetVerifySuccess(code: string) {
    setResetCode(code);
    setView("reset-new-password");
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <LogoLink />
        {view === "sign-in" && (
          <SignInCard
            email={email}
            onEmailChange={setEmail}
            onSwitchToSignUp={() => setView("sign-up")}
            onForgotPassword={() => setView("reset-request")}
          />
        )}
        {view === "sign-up" && (
          <SignUpCard
            email={email}
            onEmailChange={setEmail}
            onSwitchToSignIn={() => setView("sign-in")}
            onSuccess={handleSignUpSuccess}
          />
        )}
        {view === "reset-request" && (
          <ResetRequestCard
            email={email}
            onEmailChange={setEmail}
            onSwitchToSignIn={() => setView("sign-in")}
            onSuccess={() => setView("reset-verify")}
          />
        )}
        {view === "reset-verify" && (
          <ResetVerifyCard
            email={email}
            onSwitchToSignIn={() => setView("sign-in")}
            onSuccess={handleResetVerifySuccess}
          />
        )}
        {view === "reset-new-password" && (
          <ResetNewPasswordCard
            email={email}
            code={resetCode}
            onSwitchToSignIn={() => setView("sign-in")}
            onComplete={() => setView("sign-in")}
          />
        )}
      </main>
    </div>
  );
}

function SignInCard({
  email,
  onEmailChange,
  onSwitchToSignUp,
  onForgotPassword,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSwitchToSignUp: () => void;
  onForgotPassword: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    if (!email.trim() || !password.trim()) return;

    setSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        // Same generic message whether the email doesn't exist or the
        // password is wrong — mirrors the anti-enumeration pattern used
        // throughout the rest of this auth flow.
        setSubmitError("Incorrect email or password.");
        return;
      }
      router.push(`/projects?email=${encodeURIComponent(email)}`);
    } catch {
      setSubmitError("We could not sign you in right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Welcome back</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          Sign in to continue to your research
        </p>
        <p className={`${styles.modeLabel} ds-label-medium`}>Sign in</p>
      </div>

      <GoogleButton />
      <Divider />

      <form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          id="signin-email"
          label="Email"
          type="email"
          value={email}
          onChange={onEmailChange}
          forceShowError={submitAttempted}
          autoFocus
        />

        <PasswordField
          id="signin-password"
          label="Password"
          value={password}
          onChange={setPassword}
          forceShowError={submitAttempted}
        />

        <button
          type="button"
          onClick={onForgotPassword}
          className={`${styles.forgotLink} ds-label-medium ds-focus-ring`}
        >
          Forgot password?
        </button>

        {submitError && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {submitError}
          </span>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Signing in…" : "Sign in"}
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
  email,
  onEmailChange,
  onSwitchToSignIn,
  onSuccess,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSwitchToSignIn: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isFormValid =
    !validateFullName(fullName) && !validateEmail(email) && isPasswordValid(password);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    if (!fullName.trim() || !email.trim() || !password.trim()) return;
    if (validateFullName(fullName)) return;
    if (validateEmail(email)) return;
    if (!isPasswordValid(password)) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data: { error?: string } = await response.json();

      if (!response.ok) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      onSuccess();
    } catch {
      setSubmitError("We could not create your account right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Create your account</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          Start turning your research into trusted findings
        </p>
        <p className={`${styles.modeLabel} ds-label-medium`}>Sign up</p>
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
          onChange={onEmailChange}
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

        {submitError && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {submitError}
          </span>
        )}

        <button
          type="submit"
          disabled={!isFormValid || submitting}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Signing up…" : "Sign up"}
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

function ResetRequestCard({
  email,
  onEmailChange,
  onSwitchToSignIn,
  onSuccess,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSwitchToSignIn: () => void;
  onSuccess: () => void;
}) {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isFormValid = !validateEmail(email);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    if (validateEmail(email)) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setSubmitError("Something went wrong. Please try again.");
        return;
      }
      // Deliberately succeeds the same way whether or not an account
      // exists for this email — the API never reveals that, so neither
      // does this form.
      onSuccess();
    } catch {
      setSubmitError("We could not send the reset code right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Reset your password</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          Enter the email on your account and we&apos;ll send you a code to
          reset your password.
        </p>
        <p className={`${styles.modeLabel} ds-label-medium`}>Reset step 1 of 3</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          id="reset-request-email"
          label="Email"
          type="email"
          value={email}
          onChange={onEmailChange}
          forceShowError={submitAttempted}
        />

        {submitError && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {submitError}
          </span>
        )}

        <button
          type="submit"
          disabled={!isFormValid || submitting}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Sending…" : "Send password reset code"}
        </button>
      </form>

      <p className={`${styles.footerText} ds-body-small`}>
        Remember your password?{" "}
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

function ResetVerifyCard({
  email,
  onSwitchToSignIn,
  onSuccess,
}: {
  email: string;
  onSwitchToSignIn: () => void;
  onSuccess: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleVerify(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // This is a non-consuming peek, purely for this immediate feedback —
      // the code is checked again, and actually spent, at the final
      // confirm step. Carrying it forward in state, not re-asking for it.
      onSuccess(code);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError("Could not resend the code.");
        return;
      }
      setResendMessage("A new code has been sent.");
    } catch {
      setError("Could not resend the code.");
    }
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Enter your reset code</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          We sent a 6-digit code to <strong>{email}</strong>.
        </p>
        <p className={`${styles.modeLabel} ds-label-medium`}>Reset step 2 of 3</p>
      </div>

      <form className={styles.form} onSubmit={handleVerify}>
        <div className={styles.field}>
          <label htmlFor="reset-code" className="ds-label-large">
            Reset code
          </label>
          <input
            id="reset-code"
            name="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className={`${styles.codeInput} ds-focus-ring`}
          />
        </div>

        {error && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {error}
          </span>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || submitting}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Verifying…" : "Verify code"}
        </button>
      </form>

      <p className={`${styles.footerText} ds-body-small`}>
        <button
          type="button"
          onClick={handleResend}
          className={`${styles.footerLink} ds-label-medium ds-focus-ring`}
        >
          Resend code
        </button>
        {resendMessage && <> · {resendMessage}</>}
      </p>

      <p className={`${styles.footerText} ds-body-small`}>
        Remember your password?{" "}
        <button
          type="button"
          className={`${styles.footerLink} ds-label-medium ds-focus-ring`}
          onClick={onSwitchToSignIn}
        >
          Log in
        </button>
      </p>
    </div>
  );
}

function ResetNewPasswordCard({
  email,
  code,
  onSwitchToSignIn,
  onComplete,
}: {
  email: string;
  code: string;
  onSwitchToSignIn: () => void;
  onComplete: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isFormValid =
    isPasswordValid(newPassword) && confirmPassword !== "" && confirmPassword === newPassword;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    if (!isPasswordValid(newPassword)) return;
    if (confirmPassword !== newPassword) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onComplete();
    } catch {
      setSubmitError("We could not reset your password right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <div>
        <h1 className={`${styles.heading} ds-headline-small`}>Set a new password</h1>
        <p className={`${styles.subtitle} ds-body-medium`}>
          Choose a new password for your account.
        </p>
        <p className={`${styles.modeLabel} ds-label-medium`}>Reset step 3 of 3</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <PasswordField
          id="reset-new-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          forceShowError={submitAttempted}
          showRequirements
        />

        <PasswordField
          id="reset-confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          forceShowError={submitAttempted}
          validate={(v) => (v === newPassword ? null : "Passwords Must Match")}
        />

        {submitError && (
          <span className={`${styles.errorText} ds-label-medium`} role="alert">
            {submitError}
          </span>
        )}

        <button
          type="submit"
          disabled={!isFormValid || submitting}
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          {submitting ? "Resetting…" : "Reset password"}
        </button>
      </form>

      <p className={`${styles.footerText} ds-body-small`}>
        <button
          type="button"
          className={`${styles.footerLink} ds-label-medium ds-focus-ring`}
          onClick={onSwitchToSignIn}
        >
          Back to sign in
        </button>
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
  autoFocus = false,
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
  autoFocus?: boolean;
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
        autoFocus={autoFocus}
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


function PasswordField({
  id,
  label,
  value,
  onChange,
  forceShowError,
  showRequirements = false,
  validate,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  forceShowError: boolean;
  showRequirements?: boolean;
  // Same real-time contract as TextField's validate prop: runs on every
  // keystroke once non-empty, independent of touched/forceShowError.
  validate?: (value: string) => string | null;
}) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const isEmpty = value.trim() === "";
  const emptyError = (touched || forceShowError) && isEmpty;
  const formatError = !isEmpty && validate ? validate(value) : null;
  const errorMessage = emptyError ? `${label} field Cannot Be Empty` : formatError;
  const errorId = `${id}-error`;
  const requirementsId = `${id}-requirements`;

  // Hidden while the field is empty (nothing typed yet), then only the
  // still-unmet requirements are listed — each one drops off the list
  // individually the moment it's satisfied, rather than the whole list
  // disappearing only once every requirement is met at once.
  const unmetRequirements =
    showRequirements && value.length > 0 ? getUnmetPasswordRequirements(value) : [];
  const metRequirements =
    showRequirements && value.length > 0
      ? getPasswordRequirements(value).filter((requirement) => requirement.met)
      : [];

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
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={
            [errorMessage ? errorId : null, unmetRequirements.length ? requirementsId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className="ds-focus-ring"
        />
        {value.length > 0 && (
          <button
            type="button"
            className={`${styles.passwordToggle} ds-focus-ring`}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            <EyeIcon open={visible} />
          </button>
        )}
      </div>
      {errorMessage && (
        <span id={errorId} className={`${styles.errorText} ds-label-medium`} role="alert">
          {errorMessage}
        </span>
      )}
      {showRequirements && value.length > 0 && (
        <ul id={requirementsId} className={styles.passwordRequirements} role="status">
          {getPasswordRequirements(value).map((requirement) => (
            <li
              key={requirement.label}
              className={`${styles.passwordRequirement} ds-label-small ${requirement.met ? styles.passwordRequirementMet : styles.passwordRequirementUnmet}`}
            >
              <span className={styles.passwordRequirementIcon} aria-hidden="true">
                {requirement.met ? "✓" : "*"}
              </span>
              <span>{requirement.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getPasswordRequirements(value: string): { label: string; met: boolean }[] {
  return [
    { label: "Minimum of 8 characters", met: value.length >= 8 },
    { label: "At least one lowercase letter", met: /[a-z]/.test(value) },
    { label: "At least one uppercase letter", met: /[A-Z]/.test(value) },
    { label: "At least one number", met: /[0-9]/.test(value) },
    { label: "At least one special character (#@>^)", met: /[#@>^]/.test(value) },
  ];
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
