import nodemailer, { type Transporter } from "nodemailer";

// Server-only. Lazily constructed for the same reason the old Resend client
// was: building the transporter at import time would throw synchronously if
// GMAIL_USER/GMAIL_APP_PASSWORD are unset, crashing the entire worker
// process on startup rather than just failing the one job that needed it.
let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    // Explicit host/port instead of the `service: "gmail"` shorthand: that
    // preset defaults to port 465 (implicit TLS), which this network's
    // outbound firewall blocks — connections there just hang until they
    // time out. Port 587 (STARTTLS: connect plain, then upgrade) reaches
    // smtp.gmail.com fine on the same network, same credentials.
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

const FROM_EMAIL = process.env.GMAIL_USER;

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await getTransporter().sendMail({
    from: `UXLens AI <${FROM_EMAIL}>`,
    to,
    subject: "Verify your email — UXLens AI",
    text: `Your UXLens AI verification code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <p>Your UXLens AI verification code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const text = `Hi ${name},

Welcome to UXLens AI! We're excited to have you on board.

Your account is ready, and you're all set to start turning UX research into clear, actionable insights.

Whether you're working with user interviews, surveys, usability tests, or other research data, UXLens AI helps you analyze everything faster so you can spend more time making better product decisions.

To get started, simply create your first project and upload your research files. UXLens AI will generate an AI-powered synthesis with key insights, themes, pain points, and recommendations.

If you ever need help or have questions, just reply to this email. We're always happy to help.

Welcome aboard, and happy researching!

The UXLens AI Team`;

  await getTransporter().sendMail({
    from: `UXLens AI <${FROM_EMAIL}>`,
    to,
    subject: "Welcome to UXLens AI",
    text,
    html: text
      .split("\n\n")
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("\n"),
  });
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  await getTransporter().sendMail({
    from: `UXLens AI <${FROM_EMAIL}>`,
    to,
    subject: "Reset your password — UXLens AI",
    text: `Your UXLens AI password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email — your password will not be changed.`,
    html: `
      <p>Your UXLens AI password reset code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email — your password will not be changed.</p>
    `,
  });
}
