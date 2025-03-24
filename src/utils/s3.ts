import { S3Client } from "@aws-sdk/client-s3";

export const s3BucketName = process.env.S3_BUCKET_NAME!;
const s3Region = process.env.S3_REGION!;
const s3AccessKey = process.env.S3_ACCESS_KEY!;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;

export const s3 = new S3Client({
  region: s3Region,
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretAccessKey,
  },
});
