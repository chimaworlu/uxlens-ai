// Throwaway validation spike (Phase 0 of the BullMQ->Supabase Edge
// Functions migration plan). Not part of the real app. Tests three
// things in isolation before any real migration work is built:
//   ?check=db     - does a plain Postgres driver (same one @prisma/adapter-pg
//                   wraps) connect to Supabase Postgres from inside Deno?
//   ?check=pgmq   - does a basic pgmq send/read round trip work?
//   ?check=extract&type=pdf|docx (POST, raw file body) - do pdf-parse and
//                   mammoth actually extract text from a real file inside
//                   Deno's resource limits?
import pg from "npm:pg@8";
import { Buffer } from "node:buffer";

// pdf-parse -> pdfjs-dist expects a browser global even for text-only
// extraction. Minimal no-op polyfill to test whether it's actually
// exercised or just referenced.
if (typeof (globalThis as Record<string, unknown>).DOMMatrix === "undefined") {
  (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: unknown) {}
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
  };
}

const DATABASE_URL = Deno.env.get("SPIKE_DATABASE_URL") ?? "";

async function checkDb(): Promise<Response> {
  const start = performance.now();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query("select 1 as ok, now() as server_time");
    return Response.json({
      ok: true,
      result: result.rows[0],
      elapsedMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}

async function checkPgmq(): Promise<Response> {
  const start = performance.now();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query("select pgmq.create('spike_test_queue')").catch(() => {});
    const sendResult = await client.query(
      "select * from pgmq.send('spike_test_queue', $1::jsonb)",
      [JSON.stringify({ hello: "world", ts: Date.now() })]
    );
    const readResult = await client.query(
      "select * from pgmq.read('spike_test_queue', 30, 1)"
    );
    return Response.json({
      ok: true,
      sentMsgId: sendResult.rows[0],
      readBack: readResult.rows,
      elapsedMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}

async function checkExtract(req: Request, type: string): Promise<Response> {
  const start = performance.now();
  const buffer = new Uint8Array(await req.arrayBuffer());
  try {
    if (type === "pdf") {
      const { PDFParse } = await import("npm:pdf-parse@2");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return Response.json({
        ok: true,
        inputBytes: buffer.byteLength,
        extractedChars: result.text.length,
        preview: result.text.slice(0, 300),
        elapsedMs: Math.round(performance.now() - start),
      });
    }
    if (type === "docx") {
      const mammoth = await import("npm:mammoth@1");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return Response.json({
        ok: true,
        inputBytes: buffer.byteLength,
        extractedChars: result.value.length,
        preview: result.value.slice(0, 300),
        elapsedMs: Math.round(performance.now() - start),
      });
    }
    return Response.json({ ok: false, error: "type must be pdf or docx" }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        elapsedMs: Math.round(performance.now() - start),
      },
      { status: 500 }
    );
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const check = url.searchParams.get("check");

  if (check === "db") return checkDb();
  if (check === "pgmq") return checkPgmq();
  if (check === "extract") {
    const type = url.searchParams.get("type") ?? "";
    return checkExtract(req, type);
  }
  return Response.json(
    { error: "pass ?check=db | ?check=pgmq | ?check=extract&type=pdf|docx" },
    { status: 400 }
  );
});
