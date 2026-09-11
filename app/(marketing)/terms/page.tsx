import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Service - UXLens AI",
};

export default function TermsPage() {
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
            <h1 className="ds-headline-large">Terms of Service</h1>
            <p className={`${styles.updated} ds-body-small`}>Last updated September 5, 2026</p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">1. Acceptance of these terms</h2>
            <p className="ds-body-medium">
              By creating an account or using UXLens AI (&quot;the Service&quot;, &quot;we&quot;,
              &quot;us&quot;), you agree to these Terms of Service and our{" "}
              <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t agree, please don&apos;t
              use the Service.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">2. What the Service does</h2>
            <p className="ds-body-medium">
              UXLens AI lets you upload UX research documents (interview notes, survey results,
              customer feedback, and similar files) and generates an AI-powered analysis: organized
              themes, pain points, suggestions, and contradictions, each cited back to the exact
              source passage. You can also chat with an AI assistant grounded in your uploaded
              research.
            </p>
            <p className="ds-body-medium">
              AI-generated content can be wrong. Insights, citations, and chat answers are meant to
              help you work faster, not replace your own judgment. Always verify anything important
              against the source material before acting on it.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">3. Your account</h2>
            <p className="ds-body-medium">
              You need an account to use the Service, created either with an email and password or
              through a third-party sign-in option we offer. You&apos;re responsible for keeping
              your login credentials
              secure and for anything that happens under your account. You must provide accurate
              information and be old enough to legally enter into this agreement in your country.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">4. Your content</h2>
            <p className="ds-body-medium">
              You own the documents and content you upload. By uploading them, you give us a
              limited license to store, process, and analyze them solely to provide the Service to
              you (for example, running the analysis pipeline or answering your chat questions). We
              don&apos;t claim ownership of your research, and we don&apos;t use it for any purpose
              beyond providing the Service to your account.
            </p>
            <p className="ds-body-medium">
              Your documents and questions are never used to train AI models, ours or any
              provider&apos;s.
            </p>
            <p className="ds-body-medium">
              Research documents often contain personal information about participants. You&apos;re
              responsible for having the right to upload that content and for removing identifying
              details you don&apos;t need before uploading.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">5. Plans, billing, and cancellation</h2>
            <p className="ds-body-medium">
              The Service offers a Free plan and a paid Pro plan, billed monthly in Nigerian Naira
              (NGN) through our payment processor. Current pricing and limits are shown on the
              billing page in your account.
            </p>
            <p className="ds-body-medium">
              You can cancel your Pro subscription at any time from the billing page, with no email
              required. Cancelling stops future billing, but does not refund the current billing
              period: you keep Pro access until the end of the period you already paid for, and your
              account then moves to the Free plan.
            </p>
            <p className="ds-body-medium">
              <strong>Refunds:</strong> payments are non-refundable. This applies to cancellations
              and to downgrades; we don&apos;t issue partial or pro-rated refunds for unused time in
              a billing period.
            </p>
            <p className="ds-body-medium">
              We may change our prices. If we do, we&apos;ll give you at least 30 days&apos; notice
              before the new price applies to your account.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">6. Acceptable use</h2>
            <p className="ds-body-medium">You agree not to:</p>
            <ul className="ds-body-medium">
              <li>Use the Service for anything illegal, or to upload content you don&apos;t have the right to share.</li>
              <li>Attempt to bypass usage limits, rate limits, or the AI spend controls that keep the Service sustainable.</li>
              <li>Attempt to access another user&apos;s account, projects, or documents.</li>
              <li>Use the Service to build a competing product by systematically extracting its underlying prompts or pipeline.</li>
            </ul>
            <p className="ds-body-medium">
              We may suspend or terminate accounts that violate these terms.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">7. Deleting your account</h2>
            <p className="ds-body-medium">
              You can delete your account at any time from Account settings. Deletion cancels any
              active Pro subscription immediately, signs you out, and permanently removes your
              projects, documents, analyses, and chat history within 24 hours. This can&apos;t be
              undone.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">8. The Service is provided &quot;as is&quot;</h2>
            <p className="ds-body-medium">
              We work to keep the Service reliable and accurate, but we don&apos;t guarantee it will
              be uninterrupted, error-free, or that its AI-generated output will be complete or
              correct. To the extent permitted by law, UXLens AI isn&apos;t liable for indirect,
              incidental, or consequential damages arising from your use of the Service, and our
              total liability for any claim is limited to the amount you paid us in the three months
              before the claim arose.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">9. Changes to these terms</h2>
            <p className="ds-body-medium">
              We may update these terms as the Service evolves. If we make a material change,
              we&apos;ll notify you by email or with an in-app notice before it takes effect.
              Continuing to use the Service after a change takes effect means you accept the updated
              terms.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">10. Governing law</h2>
            <p className="ds-body-medium">
              These terms are governed by the laws of the Federal Republic of Nigeria, without
              regard to conflict-of-law principles.
            </p>
          </div>

          <div className={styles.section}>
            <h2 className="ds-title-large">11. Contact</h2>
            <p className="ds-body-medium">
              Questions about these terms? Reach us at{" "}
              <a href="mailto:uxlensai.team@gmail.com">uxlensai.team@gmail.com</a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
