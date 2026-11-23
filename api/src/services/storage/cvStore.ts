/**
 * CV file storage. With R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET set, CV
 * files go to a private Cloudflare R2 bucket (S3 API) and the database keeps only the object key.
 * Without them, files stay in the database (UserCv.data) as before. Reads handle both, so CVs saved
 * before R2 was configured keep working.
 */
import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import "../../lib/env.js"; // loads .env before the R2_* variables are read

const ACCOUNT_ID = (process.env.R2_ACCOUNT_ID ?? "").trim();
const ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
const SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
const BUCKET = (process.env.R2_BUCKET ?? "").trim();

export const r2Enabled = Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);

let client: S3Client | null = null;
function s3(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  });
  return client;
}

/** Upload a CV; returns its object key. Only call when r2Enabled. */
export async function putCvObject(userId: string, body: Buffer, contentType: string): Promise<string> {
  const key = `cv/${userId}/${Date.now()}-${randomBytes(6).toString("hex")}`;
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}

/** Best effort: a failed delete only leaves an orphaned object behind. */
export async function deleteCvObject(key: string | null | undefined): Promise<void> {
  if (!key || !r2Enabled) return;
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error(`[cv-store] delete failed: ${(err as Error).name}`);
  }
}

/** The CV's bytes, from R2 or the database. Throws if an R2 object is missing or R2 is not configured. */
export async function readCv(cv: { data: Uint8Array | null; storageKey: string | null }): Promise<Buffer> {
  if (cv.storageKey) {
    if (!r2Enabled) throw new Error("CV is stored in R2 but R2 is not configured");
    const out = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: cv.storageKey }));
    if (!out.Body) throw new Error("CV object is empty");
    return Buffer.from(await out.Body.transformToByteArray());
  }
  if (cv.data) return Buffer.from(cv.data);
  throw new Error("CV has no stored file");
}
