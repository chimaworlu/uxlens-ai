import { prisma } from "@/lib/db/prisma";

// Shared primitives for every queue migrated from BullMQ to pgmq (Phase 2
// of the Supabase Edge Functions migration, AGENTS.md Section 2). Each
// real queue's producer (lib/queue/{doc-processing,analysis,cleanup,
// email}.ts) and its consumer Edge Function both go through these rather
// than writing raw pgmq SQL inline, so the retry/dead-letter behavior
// BullMQ used to give for free stays consistent across all four queues.

// pgmq has no built-in retry ceiling — a message just keeps becoming
// visible again after its visibility window lapses unless something
// archives it. This mirrors BullMQ's old per-queue `attempts` config
// (doc-processing/cleanup: 3, analysis: 2).
export const RETRY_LIMITS: Record<string, number> = {
  doc_processing: 3,
  analysis: 2,
  analysis_pass_b: 2,
  analysis_pass_c: 2,
  analysis_pass_d: 2,
  cleanup: 3,
  email: 3,
};

export async function sendToQueue(
  queueName: string,
  payload: Record<string, unknown>
): Promise<bigint> {
  const result = await prisma.$queryRaw<{ send: bigint }[]>`
    SELECT * FROM pgmq.send(${queueName}::text, ${JSON.stringify(payload)}::jsonb)
  `;
  const msgId = result[0]?.send;
  if (msgId === undefined) throw new Error(`pgmq.send('${queueName}') returned no message id.`);
  return msgId;
}

export type PgmqMessage<T> = {
  msgId: bigint;
  readCount: number;
  message: T;
};

// visibilitySeconds: how long this message is hidden from other readers
// while the caller processes it — should be comfortably longer than the
// consumer Edge Function's expected processing time for one message, so
// a slow-but-successful run doesn't get picked up again mid-flight.
export async function readFromQueue<T>(
  queueName: string,
  visibilitySeconds: number,
  count = 1
): Promise<PgmqMessage<T>[]> {
  const rows = await prisma.$queryRaw<
    { msg_id: bigint; read_ct: number; message: T }[]
  >`SELECT * FROM pgmq.read(${queueName}::text, ${visibilitySeconds}::integer, ${count}::integer)`;
  return rows.map((row) => ({ msgId: row.msg_id, readCount: row.read_ct, message: row.message }));
}

// Call after a message is fully, successfully processed.
export async function archiveMessage(queueName: string, msgId: bigint): Promise<void> {
  // pgmq.archive is overloaded (single id vs. array of ids) — explicit
  // casts are required or Postgres can't pick an overload ("function ...
  // is not unique").
  await prisma.$executeRaw`SELECT pgmq.archive(${queueName}::text, ${msgId}::bigint)`;
}

// Call when a message fails but hasn't hit its retry ceiling yet — just
// lets the visibility window lapse naturally by doing nothing, OR pass a
// non-null vt to force it visible again sooner than the default window.
// Exists mainly for documentation/symmetry with archiveMessage and
// deadLetter below; most callers just let the window lapse.
export async function retryLater(): Promise<void> {
  // Intentionally a no-op — see comment above.
}

// Call when readCount has reached (or exceeded) the queue's RETRY_LIMIT:
// archives the pgmq message (so it stops being re-delivered) and records
// why, mirroring what BullMQ did automatically when a job exhausted its
// `attempts`.
export async function deadLetter(
  queueName: string,
  msg: PgmqMessage<unknown>,
  error: string
): Promise<void> {
  await prisma.deadLetterMessage.create({
    data: {
      queueName,
      originalMsgId: msg.msgId,
      payload: msg.message as object,
      readCount: msg.readCount,
      lastError: error,
    },
  });
  await archiveMessage(queueName, msg.msgId);
}
