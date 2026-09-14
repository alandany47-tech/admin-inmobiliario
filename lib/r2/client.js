import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cliente S3 apuntando a Cloudflare R2 (API compatible S3). El bucket no es
 * público: toda lectura pasa por una URL firmada generada bajo demanda.
 */
export function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
