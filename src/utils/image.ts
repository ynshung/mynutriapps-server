import sharp from "sharp";
import { db } from "../db";
import { imagesTable } from "../db/schema";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, s3BucketName } from "./s3";
import { logger } from "./logger";

const resizeImage = async (image: Buffer) => {
  const { width, height } = await sharp(image).metadata();
  const resizeOptions = width && height && (width > 2000 || height > 2000) ? { width: 2000 } : {};
  return sharp(image).resize(resizeOptions).jpeg({ quality: 50 }).toBuffer();
};

const uploadToS3 = async (key: string, buffer: Buffer, mimetype: string) => {
  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: key,
    Body: await resizeImage(buffer),
    ContentType: mimetype,
  });

  try {
    await s3.send(command);
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error("Error uploading file");
  }
};

// TODO: Add image size variations
export const uploadImage = async (image: Express.Multer.File, userID: number) => {
  const imageKey = `public/${userID}/${Date.now()}-${image.originalname}`;

  try {
    await uploadToS3(imageKey, image.buffer, image.mimetype);
  } catch (error) {
    console.error("Failed to upload image:", error);
    throw new Error("Image upload failed");
  }
  
  const result = await db.insert(imagesTable).values({
    userID,
    imageKey: imageKey,
    mimeType: image.mimetype,
    size: image.size,
    fileName: image.originalname,
  }).returning({ id: imagesTable.id });

  logger.info({
    userID: userID,
    message: "Image uploaded",
    imageKey: imageKey,
    mimeType: image.mimetype,
    size: image.size,
    fileName: image.originalname,
    imageID: result[0].id,
  });

  return result[0].id;
}
