import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.ts";

export const EMAIL_QUEUE_NAME = "email";

export type EmailJob =
  | { type: "verification"; to: string; code: string }
  | { type: "password-reset"; to: string; code: string }
  | { type: "welcome"; to: string; name: string };

// Producer side, used by API routes. AGENTS.md: BullMQ consumers only ever
// run in the separate worker process (worker/queues/email.ts) — this file
// only ever adds jobs, never processes them.
//
// defaultJobOptions.attempts: every send (welcome, verification, password
// reset) gets 3 tries with exponential backoff before it's given up on.
// Without this, a single transient failure — an SMTP connection timeout, a
// momentary Redis blip — permanently drops that email with no recovery
// beyond the user manually noticing and clicking "Resend". This is exactly
// the failure mode that already happened once (port 465 being blocked).
export const emailQueue = new Queue<EmailJob>(EMAIL_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export async function enqueueVerificationEmail(to: string, code: string): Promise<void> {
  const job: EmailJob = { type: "verification", to, code };
  await emailQueue.add("send-verification-email", job);
}

export async function enqueuePasswordResetEmail(to: string, code: string): Promise<void> {
  const job: EmailJob = { type: "password-reset", to, code };
  await emailQueue.add("send-password-reset-email", job);
}

export async function enqueueWelcomeEmail(to: string, name: string): Promise<void> {
  const job: EmailJob = { type: "welcome", to, name };
  await emailQueue.add("send-welcome-email", job);
}
