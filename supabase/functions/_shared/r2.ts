// Ported from lib/storage/r2.ts's downloadObject — only the read path
// this function needs, not the presign/upload side (that stays entirely
// on the Next.js app, per AGENTS.md: uploads never proxy through any
// app server, Edge Functions included).
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";

let client: InstanceType<typeof S3Client> | undefined;

function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: Deno.env.get("R2_ENDPOINT"),
      credentials: {
        accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") ?? "",
        secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "",
      },
    });
  }
  return client;
}

export async function downloadObject(key: string): Promise<Uint8Array> {
  const command = new GetObjectCommand({
    Bucket: Deno.env.get("R2_BUCKET_NAME"),
    Key: key,
  });
  const response = await getClient().send(command);
  const bytes = await response.Body?.transformToByteArray();
  return bytes ?? new Uint8Array();
}
