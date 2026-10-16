import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicDomain = process.env.R2_PUBLIC_DOMAIN?.replace(/\/$/, "");

/**
 * Returns true if all Cloudflare R2 environment variables are configured.
 */
export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName && publicDomain);
}

/**
 * Creates an S3 Client pointing to the Cloudflare R2 endpoint.
 */
export function getR2Client(): S3Client {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are missing from environment variables.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Uploads an image or file buffer directly to Cloudflare R2
 * and returns the public CDN link.
 */
export async function uploadToR2(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const { key, buffer, contentType } = params;
  if (!bucketName || !publicDomain) {
    throw new Error("R2_BUCKET_NAME or R2_PUBLIC_DOMAIN is not set in .env");
  }

  const s3 = getR2Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${publicDomain}/${key}`;
}

/**
 * Deletes a file from Cloudflare R2 if it belongs to your bucket domain.
 */
export async function deleteFromR2(url: string): Promise<boolean> {
  if (!isR2Configured() || !publicDomain || !url.startsWith(publicDomain)) {
    return false;
  }

  const key = url.replace(`${publicDomain}/`, "");
  const s3 = getR2Client();

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return true;
  } catch (err) {
    console.error("Failed to delete object from R2:", err);
    return false;
  }
}
