// One-off / idempotent setup for the public demo (FR-37): creates a
// dedicated demo User + Project, uploads a synthetic research document to
// R2, runs it through the real extraction/chunking/analysis pipeline (same
// code path the app itself uses — no hand-authored insights), so the
// public demo shows a genuinely verified analysis, not a mock.
//
// Safe to re-run: the user and project are upserted by a fixed email
// (lib/demo.ts's DEMO_USER_EMAIL); if a READY analysis already exists for
// that project this exits without doing anything (no wasted AI spend). Pass
// --force to delete the existing project's data and reseed from scratch.
//
//   node scripts/seed-demo.ts [--force]
//
// Plain `node` execution, same constraints as worker/index.ts: relative
// imports with explicit .ts extensions, no "@/" alias, .env loaded
// manually.
import "dotenv/config";
import { setDefaultResultOrder } from "node:dns";

// Same fix as worker/index.ts: this script's R2 upload (fetch) can fail
// with a generic "fetch failed" on networks that advertise IPv6 for
// cloudflarestorage.com but can't actually route to it. Preferring IPv4
// resolution avoids that, same as the worker.
setDefaultResultOrder("ipv4first");

import { prisma } from "../lib/db/prisma.ts";
import { DEMO_USER_EMAIL, DEMO_PROJECT_NAME } from "../lib/demo.ts";
import { buildDocumentKey, getPresignedUploadUrl } from "../lib/storage/r2.ts";
import { extractText } from "../lib/pipeline/extract.ts";
import { chunkText } from "../lib/pipeline/chunk.ts";
import { runAnalysis } from "../lib/pipeline/analysis/run.ts";

const DEMO_FILENAME = "Coinly - Budgeting App Research Notes.txt";

// Fictional product, fictional participants — written for this demo, not
// real research data. Six semi-structured interviews about a budgeting
// app, chosen to surface a genuine mix of themes, pain points,
// suggestions, and at least one real contradiction (automation vs.
// manual control), matching FR-17's required analysis sections.
const DEMO_DOCUMENT_TEXT = `Coinly Budgeting App - User Research Notes
Round of 6 semi-structured interviews, 30 minutes each, remote video calls.
Participants are existing users of at least one budgeting or finance app.

Participant 1 - Amaka, 29, marketing coordinator
Amaka has used Coinly for about four months after switching from a spreadsheet. She said the bank sync was the main reason she switched: "I just got tired of typing every transaction in by hand every Sunday night." She likes that Coinly automatically pulls in transactions from her two bank accounts and one credit card. Her biggest complaint is that the automatic categorization is often wrong, especially for anything from a small local business. "It puts my hairdresser under 'Shopping' and my favorite lunch spot under 'Entertainment' and I have to go fix it every single week." She said she wishes she could set a rule once - "if it's from this merchant, always put it in this category" - instead of re-categorizing the same transaction every month. She also mentioned that when her bank sync breaks, which has happened three times, she gets no warning and only notices when her balance looks wrong. "A little banner saying 'we couldn't reach your bank, here's why' would save me so much confusion."

Participant 2 - Daniel, 41, self-employed contractor
Daniel does not trust automatic bank syncing at all and manually enters every transaction into Coinly using the quick-add button. "I've had apps miscategorize a client payment as income tax and it messed up my whole month. I'd rather just do it myself and know it's right." He spends about 15 minutes a day on this. What he wants most is a faster manual entry flow - right now adding a transaction takes him five taps (open app, tap add, select category, type amount, confirm), and he'd like a shortcut from his phone's home screen or lock screen. He also does a lot of cash transactions for supplies and says there's no good way to log cash spending quickly; he currently uses his phone's Notes app for that and enters it into Coinly later, which he called "a workaround that shouldn't be necessary in 2026." Daniel was clear that he does not want more automation - he wants faster, more reliable manual tools.

Participant 3 - Priya, 34, nurse, married with one child
Priya and her husband share a household budget but each has Coinly installed separately with no shared view. "Right now I have to text him a screenshot every time I want to show him where we're overspending." She said the single biggest missing feature for her is a shared or family budget that both partners can see and edit, ideally with separate logins so they can each track personal spending too. She also said the notifications feel excessive - Coinly currently sends a push notification for every transaction over a set amount, and she gets 10-15 a day between her and her husband's spending. "I've just started ignoring all of them, which probably defeats the purpose." She'd prefer a single daily or weekly digest instead of real-time alerts for everything. On categorization, she said it's "fine, not great" but not a major pain point for her the way it was for Amaka.

Participant 4 - Tunde, 52, small business owner
Tunde uses Coinly for personal finances only, separate from his business accounting software. He specifically praised the automatic categorization: "Honestly it gets it right probably 90% of the time and that's more than good enough for me, I don't want to fuss over percentages." His main frustration was around goals - he set up a savings goal for a car down payment, but said the progress bar doesn't update fast enough and sometimes shows stale numbers for a day or two after a sync. He also said the export feature (CSV) is hard to find, buried three menus deep, and he only uses it once a year for taxes so he can never remember where it is. He suggested a simple search bar in settings so he doesn't have to hunt through menus.

Participant 5 - Chioma, 24, recent graduate, new to budgeting apps
Chioma downloaded Coinly two months ago as her first-ever budgeting app. She described the onboarding as "a bit much" - she was asked to connect a bank account, set category budgets for twelve categories, and set a savings goal all before she'd seen a single real transaction. "I just wanted to see what my spending looked like first. I skipped most of the setup and I'm not sure I did it right." She said she still doesn't fully understand what some of the default categories mean (she gave "Miscellaneous" and "Fees & Charges" as examples) and would like short explanations or examples next to category names. Once she got past onboarding, she said the day-to-day app is "actually pretty simple and I like the little charts." She also independently mentioned wanting to set rules so recurring transactions from the same merchant always get the same category, echoing what Amaka said.

Participant 6 - Segun, 37, freelance graphic designer
Segun has irregular income and said most budgeting apps, Coinly included, assume a steady paycheck. "My income is different every month, so a fixed monthly budget doesn't really work for me." He wants an option to budget based on income received rather than a fixed monthly allowance, or at minimum a clearer rolling-average view of his income over the last few months. Like Daniel, he does a mix of manual and automatic entry, but unlike Daniel, he said he mostly trusts the automatic categorization for his personal spending and only manually re-checks anything related to his business income, because misclassifying a client payment as a refund or transfer has thrown off his tax estimates before. He also asked for a way to flag a transaction as "needs review" so he can come back to it later without losing track, since right now if he doesn't fix a miscategorized transaction immediately he says he usually forgets about it.

Follow-up note from researcher: across all six interviews, automatic bank sync and categorization was the most discussed feature area, but opinions were sharply split. Amaka, Chioma, and Tunde are broadly positive about automation and want it refined further (custom rules, better reliability). Daniel is actively opposed to automation for anything financially sensitive and wants faster manual tools instead. Segun sits in between, trusting automation for personal spending but not for business-related transactions. This is a real split in the user base, not a single "automation is good" or "automation is bad" consensus, and any redesign of the categorization system should account for both groups rather than assuming one preference.`;

async function main() {
  const force = process.argv.includes("--force");

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    // Not a real, sign-in-able account: no passwordHash (credentials login
    // always fails for a null hash), never verified, never touched by any
    // auth flow — the public /api/demo routes never call getSessionUserId
    // or otherwise treat this as a logged-in session.
    update: {},
    create: { email: DEMO_USER_EMAIL, name: "Demo", plan: "PRO" },
    select: { id: true },
  });

  let project = await prisma.project.findFirst({
    where: { userId: user.id, name: DEMO_PROJECT_NAME },
    select: { id: true },
  });

  if (project && force) {
    console.log("--force: deleting existing demo project and reseeding.");
    await prisma.project.delete({ where: { id: project.id } });
    project = null;
  }

  if (project) {
    const readyAnalysis = await prisma.analysis.findFirst({
      where: { projectId: project.id, status: "READY" },
      select: { id: true },
    });
    if (readyAnalysis) {
      console.log("Demo project already seeded with a READY analysis — nothing to do. Use --force to reseed.");
      await prisma.$disconnect();
      return;
    }
  } else {
    project = await prisma.project.create({
      data: { userId: user.id, name: DEMO_PROJECT_NAME },
      select: { id: true },
    });
  }

  console.log(`Demo project: ${project.id}`);

  const documentId = `demo-doc-${project.id}`;
  const objectKey = buildDocumentKey(user.id, project.id, documentId, DEMO_FILENAME);
  const buffer = Buffer.from(DEMO_DOCUMENT_TEXT, "utf-8");

  // Real R2 upload (not a proxied byte-copy — same presigned-PUT primitive
  // the browser uses for a real upload) so "view full document" works
  // identically to any other project's document.
  const uploadUrl = await getPresignedUploadUrl(objectKey, "text/plain");
  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: buffer,
  });
  if (!putResponse.ok) {
    throw new Error(`R2 upload failed: ${putResponse.status} ${await putResponse.text()}`);
  }
  console.log("Uploaded demo document to R2.");

  // Same extraction + chunking the doc-processing worker runs on a real
  // upload (worker/queues/doc-processing.ts) — inline here since this
  // script isn't going through BullMQ.
  const { extractedText, pageCount } = await extractText(buffer, "TXT");
  const chunks = chunkText(extractedText);

  const document = await prisma.document.upsert({
    where: { id: documentId },
    update: {
      extractedText,
      pageCount,
      status: "READY",
      sizeBytes: buffer.byteLength,
    },
    create: {
      id: documentId,
      projectId: project.id,
      filename: DEMO_FILENAME,
      type: "TXT",
      status: "READY",
      r2Key: objectKey,
      sizeBytes: buffer.byteLength,
      extractedText,
      pageCount,
    },
    select: { id: true },
  });

  await prisma.documentChunk.deleteMany({ where: { documentId: document.id } });
  await prisma.documentChunk.createMany({
    data: chunks.map((chunk, ordinal) => ({
      documentId: document.id,
      ordinal,
      content: chunk.content,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      pageNumber: chunk.pageNumber,
    })),
  });
  console.log(`Extracted and chunked demo document (${chunks.length} chunks).`);

  const analysis = await prisma.analysis.create({
    data: { projectId: project.id, version: 1, status: "QUEUED", documentCount: 1 },
    select: { id: true },
  });
  await prisma.analysisDocument.create({
    data: { analysisId: analysis.id, documentId: document.id, filename: DEMO_FILENAME },
  });

  console.log("Running the real analysis pipeline (Pass A-D)... this makes live AI calls.");
  await runAnalysis(analysis.id);
  console.log("Demo analysis complete and READY.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Failed to seed demo:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
