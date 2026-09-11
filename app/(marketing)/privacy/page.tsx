import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy - UXLens AI",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={`${styles.navBrand} ds-title-large ds-focus-ring`}>
          UXLens AI
        </Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.content}>
          <div>
            <h1 className="ds-headline-large">Privacy Policy</h1>
            <p className={`${styles.updated} ds-body-small`}>Last updated September 5, 2026</p>
          </div>

          <div className={styles.section}>
            <p className="ds-body-medium">
              This policy explains what information UXLens AI (&quot;we&quot;, &quot;us&quot;)
              collects, how we use it, and who else sees it. It should be read alongside our{" "}
              <Link href="/terms">Terms of Service</Link>.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">1. What we collect</h2>
            <ul className="ds-body-medium">
              <li>
                <strong>Account information:</strong> your name, email address, and (if you sign up
                with a password) a securely hashed password. If you sign in using a third-party
                sign-in option we offer, we receive your name and email from that provider.
              </li>
              <li>
                <strong>Your research content:</strong> the documents you upload, the text extracted
                from them, and the questions you ask in chat.
              </li>
              <li>
                <strong>Usage data:</strong> things like how many analyses or chat messages
                you&apos;ve used, needed to enforce plan limits and keep the Service running
                reliably.
              </li>
              <li>
                <strong>Billing information:</strong> handled directly by our payment processor. We
                don&apos;t receive or store your full card details ourselves.
              </li>
            </ul>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">2. How we use it</h2>
            <p className="ds-body-medium">
              We use this information to provide the Service: running your analyses, answering your
              chat questions, enforcing plan limits, processing payments, sending account-related
              emails (verification codes, password resets, billing receipts), and responding when
              you contact us for support.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">3. Data residency</h2>
            <p className="ds-body-medium">
              We currently run the Service from a single region and don&apos;t offer a choice of
              data residency location. If this matters for your organization&apos;s compliance
              needs, contact us before uploading sensitive content.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">4. How long we keep your data</h2>
            <p className="ds-body-medium">
              We keep your data for as long as your account is active. Chat history you clear is
              soft-deleted immediately and permanently removed within 30 days. If you delete your
              account, all of your projects, documents, analyses, and chat history are permanently
              removed within 24 hours, and any active Pro subscription is cancelled immediately as
              part of that process.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">5. Security</h2>
            <p className="ds-body-medium">
              Passwords are stored as salted hashes, never in plain text. Documents are stored in a
              private bucket, never publicly accessible, and served only through short-lived
              presigned links. All traffic to the Service is encrypted in transit.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">6. Cookies</h2>
            <p className="ds-body-medium">
              We use a single essential cookie to keep you signed in (HTTP-only, so it can&apos;t be
              read by page scripts). The public demo also sets a short-lived session cookie to track
              its message limit for anonymous visitors. We don&apos;t use advertising or tracking
              cookies.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">7. Your rights</h2>
            <p className="ds-body-medium">
              You can review and correct your account information from Account settings at any
              time, and delete your account and all associated data yourself, without contacting us.
              If you have other questions about your data, email us and we&apos;ll help.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">8. Changes to this policy</h2>
            <p className="ds-body-medium">
              If we make a material change to this policy, we&apos;ll notify you by email or with an
              in-app notice before it takes effect.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">9. Contact</h2>
            <p className="ds-body-medium">
              Questions about this policy or your data? Reach us at{" "}
              <a href="mailto:uxlensai.team@gmail.com">uxlensai.team@gmail.com</a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
