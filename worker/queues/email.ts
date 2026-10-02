import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../../lib/queue/connection.ts";
import { EMAIL_QUEUE_NAME, type EmailJob } from "../../lib/queue/email.ts";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendContactEmail,
} from "../../lib/email/nodemailer.ts";

export function startEmailWorker(): Worker<EmailJob> {
  return new Worker<EmailJob>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJob>) => {
      if (job.data.type === "verification") {
        await sendVerificationEmail(job.data.to, job.data.code);
      } else if (job.data.type === "password-reset") {
        await sendPasswordResetEmail(job.data.to, job.data.code);
      } else if (job.data.type === "welcome") {
        await sendWelcomeEmail(job.data.to, job.data.name);
      } else if (job.data.type === "contact") {
        await sendContactEmail(job.data.name, job.data.email, job.data.message);
      }
    },
    { connection: getRedisConnection() }
  );
}
