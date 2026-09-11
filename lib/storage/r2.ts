import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Server-only. Lazily constructed for the same reason the email transporter
// and Prisma client are: building the client at import time would throw if
// the R2_* env vars are unset, crashing the whole process rather than just
// failing the one request that needed it. R2 is S3-compatible, so the AWS
// SDK works against it with a custom endpoint and "auto" region.
let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}

const PRESIGN_EXPIRY_SECONDS = 10 * 60;
const CONTROL_CHARS_PATTERN = new RegExp(`[\\u0000-\\u001f\\u007f]`, "g");

// .agent/rules/uploads-and-storage.md: object keys follow this exact shape
// — other jobs (cleanup, export, deletion) parse or construct keys assuming
// it, so never deviate.
export function buildDocumentKey(
  userId: string,
  projectId: string,
  documentId: string,
  filename: string
): string {
  return `users/${userId}/projects/${projectId}/docs/${documentId}/${sanitizeFilename(filename)}`;
}

// Strips path separators, control characters, and directory-traversal
// sequences before a user-supplied filename ever becomes part of a storage
// key — a raw filename is untrusted input, not something safe to path-join.
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const cleaned = base
    .replace(CONTROL_CHARS_PATTERN, "")
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .slice(-200);
  return cleaned || "file";
}

// .agent/rules/uploads-and-storage.md: uploads never proxy file bytes
// through the app server — the client PUTs directly to this URL. Never a
// public or long-lived URL; short expiry, single use in intent.
export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

// Server-side magic-byte validation without proxying the whole file: a
// ranged GET pulls back only the first few bytes needed to check the file
// signature, after the file has already landed in R2 via the presigned PUT.
export async function readObjectHeader(key: string, byteLength: number): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Range: `bytes=0-${byteLength - 1}`,
  });
  const response = await getClient().send(command);
  const bytes = await response.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

// "Open full document" on the citation panel: a short-lived, read-only URL
// for the original file, same pattern as the presigned upload URL but for
// GET. Inline disposition so PDFs open in a browser tab instead of forcing
// a download.
export async function getPresignedDownloadUrl(key: string, filename: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `inline; filename="${sanitizeFilename(filename)}"`,
  });
  return getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

// Full-object download — used only by the extraction worker, a trusted
// server process reading its own R2 bucket. Not the same thing as
// proxying an upload through the app server (that rule is about the
// client-to-server-to-R2 path, never about the worker processing a file
// that already landed in R2 via the presigned-PUT flow).
export async function downloadObject(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  const response = await getClient().send(command);
  const bytes = await response.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}
