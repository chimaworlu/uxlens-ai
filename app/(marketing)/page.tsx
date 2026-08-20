"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type Section = "home" | "testimonial" | "contact";

const TITLE_COPY: Record<Section, string> = {
  home: "UXLens AI - Turn Research Into Findings You Can Trust",
  testimonial: "Testimonials - UXLens AI",
  contact: "Contact - UXLens AI",
};

const FOOTER_COPY: Record<Section, string> = {
  home: "UXLens AI · Built for Product Designers",
  testimonial:
    "UXLens AI helps solo Product Designer uncover the insights that drive real business growth.",
  contact: "UXLens AI · Built for Product Designers",
};

const TESTIMONIALS = [
  {
    initials: "MR",
    name: "Maya Rivera",
    role: "Solo Product Designer, Freelance",
    quote:
      "As a solo product designer, I used to drown in transcripts with no time to connect the dots. UXLens AI surfaced the exact insight that led us to pivot our onboarding revenue jumped 22% in one quarter.",
  },
  {
    initials: "JT",
    name: "James Thornton",
    role: "Independent Product Design Consultant",
    quote:
      "I'm a one-person design team, and UXLens AI gave me the firepower of an entire department. It uncovered a retention pattern I'd missed fixing it drove a 3x improvement in user activation.",
  },
  {
    initials: "AP",
    name: "Anika Patel",
    role: "Solo Product Designer & Product Advisor",
    quote:
      "Running product design solo used to mean choosing between speed and depth. UXLens AI let me do both the insights it found directly shaped a feature that grew our MRR by 40%.",
  },
];

export default function MarketingPage() {
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.title = TITLE_COPY[activeSection];
  }, [activeSection]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  function goTo(section: Section) {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }

  return (
    <div className={styles.page}>
      <nav
        className={styles.nav}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mobileMenuOpen) {
            setMobileMenuOpen(false);
            hamburgerRef.current?.focus();
          }
        }}
      >
        <button
          type="button"
          className={`${styles.navBrand} ds-title-large ds-focus-ring`}
          onClick={() => goTo("home")}
        >
          UXLens AI
        </button>

        <button
          type="button"
          ref={hamburgerRef}
          className={`${styles.hamburger} ds-focus-ring`}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <MenuIcon open={mobileMenuOpen} />
        </button>

        <div
          id="mobile-nav-menu"
          className={`${styles.navMenu} ${
            mobileMenuOpen ? styles.navMenuOpen : ""
          }`}
        >
          <div className={styles.navLinks}>
            <button
              type="button"
              className={`${styles.navLink} ds-label-large ds-focus-ring ${
                activeSection === "testimonial" ? styles.navLinkActive : ""
              }`}
              onClick={() => goTo("testimonial")}
            >
              Testimonial
            </button>
            <button
              type="button"
              className={`${styles.navLink} ds-label-large ds-focus-ring ${
                activeSection === "contact" ? styles.navLinkActive : ""
              }`}
              onClick={() => goTo("contact")}
            >
              Contact
            </button>
          </div>

          <Link
            href="/auth?view=sign-up"
            className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Sign up free
          </Link>
        </div>
      </nav>

      <main className={styles.main}>
        {activeSection === "home" && <HeroSection />}
        {activeSection === "testimonial" && <TestimonialSection />}
        {activeSection === "contact" && <ContactSection />}
      </main>

      <footer className={`${styles.footer} ds-body-small`}>
        {FOOTER_COPY[activeSection]}
      </footer>
    </div>
  );
}

function HeroSection() {
  return (
    <div className={styles.hero}>
      <h1 className="ds-display-medium">
        Turn your research into findings you can trust
      </h1>
      <p className="ds-body-large">
        Upload your research and get organized themes, pain points, and
        suggestions, with every insight cited back to its source.
      </p>
      <div className={styles.heroActions}>
        <Link
          href="/auth?view=sign-up"
          className={`${styles.buttonPrimary} ds-label-large ds-focus-ring`}
        >
          Sign up free
        </Link>
        <button
          type="button"
          className={`${styles.buttonOutlined} ds-label-large ds-focus-ring`}
        >
          <PlayIcon />
          Try the live demo
        </button>
      </div>
      <span className={`${styles.heroNote} ds-body-small`}>
        No account needed for the demo.
      </span>
    </div>
  );
}

function TestimonialSection() {
  return (
    <div className={styles.section}>
      <h2 className="ds-headline-large">Trusted by product designers everywhere</h2>
      <p className="ds-body-large">
        UXLens AI helps solo Product Designer uncover the insights that drive real
        business growth.
      </p>

      <div className={styles.testimonialGrid}>
        {TESTIMONIALS.map((testimonial) => (
          <article key={testimonial.name} className={styles.testimonialCard}>
            <p className={`${styles.testimonialQuote} ds-body-medium`}>
              &ldquo;{testimonial.quote}&rdquo;
            </p>
            <div className={styles.testimonialAuthor}>
              <span className={`${styles.avatar} ds-label-large`}>
                {testimonial.initials}
              </span>
              <div>
                <div className={`${styles.testimonialAuthorName} ds-title-small`}>
                  {testimonial.name}
                </div>
                <div className={`${styles.testimonialAuthorRole} ds-label-small`}>
                  {testimonial.role}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContactSection() {
  return (
    <div className={styles.section}>
      <h2 className="ds-headline-large">Get in touch</h2>
      <p className="ds-body-large">
        Questions, feedback, or a bug to report? Send us a note.
      </p>

      <form
        className={styles.contactCard}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.field}>
          <label htmlFor="contact-name" className="ds-label-large">
            Your Name
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            className="ds-focus-ring"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="contact-email" className="ds-label-large">
            Work Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            className="ds-focus-ring"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="contact-message" className="ds-label-large">
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            className="ds-focus-ring"
          />
        </div>
        <button
          type="submit"
          className={`${styles.buttonPrimary} ${styles.buttonFullWidth} ds-label-large ds-focus-ring`}
        >
          Submit request
        </button>
      </form>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 1.5v9l8-4.5-8-4.5z" fill="currentColor" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {open ? (
        <path
          d="M4 4l12 12M16 4L4 16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M3 6h14M3 10h14M3 14h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
