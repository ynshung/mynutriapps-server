import sharp from "sharp";
import { db } from "../db";
import { imagesTable } from "../db/schema";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, s3BucketName } from "./s3";
import { logger } from "./logger";
import { processImage } from "./frontImageVector";

const resizeImage = async (image: Buffer) => {
  const { width, height } = await sharp(image).metadata();
  const resizeOptions =
    width && height && (width > 2000 || height > 2000) ? { width: 2000 } : {};
  return sharp(image).resize(resizeOptions).webp({ quality: 75 }).toBuffer();
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
export const uploadImage = async (
  image: Express.Multer.File,
  userID: number,
  prependDate: boolean = true,
  addEmbedding: boolean = false,
) => {
  const imageKey = prependDate
    ? `public/${userID}/${Date.now() - Math.floor(Math.random() * 1000 - 500)}-${image.originalname}`
    : `public/${userID}/${image.originalname}`;
  
  if (image.buffer.byteLength === 0) {
    logger.warn({
      userID: userID,
      message: "Unexpected empty image buffer",
      imageKey: imageKey,
    });
    throw new Error("Image buffer is empty");
  }

  try {
    await uploadToS3(imageKey, image.buffer, image.mimetype);
  } catch (error) {
    console.error("Failed to upload image:", error);
    throw new Error("Image upload failed");
  }

  let embedding: number[] | undefined = undefined;
  if (addEmbedding) {
    const blob = new Blob([image.buffer], { type: image.mimetype });
    const embeddingData = await processImage(blob);
    if (!embeddingData || embeddingData.status !== "success") {
      console.warn("Error processing image vector:", imageKey);
    } else {
      embedding = embeddingData.data;
    }
  }

  const result = await db
    .insert(imagesTable)
    .values({
      userID,
      imageKey: imageKey,
      mimeType: image.mimetype,
      size: image.size,
      embedding,
      fileName: image.originalname,
    })
    .returning({ id: imagesTable.id });

  logger.info({
    userID: userID,
    message: "Image uploaded",
    imageKey: imageKey,
    mimeType: image.mimetype,
    size: image.size,
    fileName: image.originalname,
    imageID: result[0].id,
  });

  return {
    imageID: result[0].id,
    imageKey: imageKey,
  };
};
