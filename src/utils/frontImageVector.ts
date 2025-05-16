import { db } from "@/src/db";
import {
  foodProductPublicView,
  imageFoodProductsTable,
  imagesTable,
  nutritionInfoTable,
} from "@/src/db/schema";
import { s3 } from "@/src/utils/s3";
import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const listFoodProductFrontImageUnvectorized = async () => {
  const data = await db
    .select({
      id: imagesTable.id,
      imageKey: imagesTable.imageKey,
      foodProductId: imageFoodProductsTable.foodProductId,
      embedding: imagesTable.embedding,
    })
    .from(imageFoodProductsTable)
    .where(
      and(
        eq(imageFoodProductsTable.type, "front"),
        isNull(imagesTable.embedding)
      )
    )
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId));

  return data;
};

const fetchImageFromS3 = async (imageKey: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: imageKey,
  });
  const response = await s3.send(command);
  const arrayBuffer = await response.Body?.transformToByteArray();
  const imageBlob = arrayBuffer ? new Blob([arrayBuffer]) : null;

  return imageBlob;
};

const checkAIServerStatus = async () => {
  try {
    const response = await fetch(process.env.BACKEND_AI_HOST + "/status");
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.status === "ok";
  } catch (error) {
    console.error("Error checking AI server status:", error);
    return false;
  }
};

export const processImage = async (imageBlob: Blob) => {
  const formData = new FormData();
  formData.append("image", imageBlob, "image.jpg");

  const response = await fetch(process.env.BACKEND_AI_HOST + "/api/v1/fpiv", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    console.error("Error processing image:", await response.text());
    return null;
  }
  const data = await response.json();
  return data as {
    data: number[];
    status: string;
  };
};

export const processUnvectorizedImages = async () => {
  if (!(await checkAIServerStatus())) {
    console.warn("AI server is not reachable");
    return;
  }

  const data = await listFoodProductFrontImageUnvectorized();
  if (!data || data.length === 0) {
    console.log("No images to process");
    return;
  }
  for (const item of data) {
    const imageKey = item.imageKey;

    const image = await fetchImageFromS3(imageKey);
    if (!image) {
      console.error("Image not found in S3:", imageKey);
      continue;
    }

    const embeddingData = await processImage(image);
    if (!embeddingData || embeddingData.status !== "success") {
      console.error("Error processing image:", imageKey);
      continue;
    }

    await db
      .update(imagesTable)
      .set({ embedding: embeddingData.data })
      .where(eq(imagesTable.id, item.id))
      .execute();

    console.log("Updated embedding for image:", imageKey);
  }
  console.log(data.length, "images processed");
  return data.length;
};

export const findSimilarFoodProductByVector = async ({
  embedding,
  category,
  limit = 10,
}: {
  embedding: number[];
  category: number;
  limit?: number;
}) => {
  const similarity = sql<number>`1 - (${cosineDistance(
    imagesTable.embedding,
    embedding
  )})`;

  const similarProducts = await db
    .select({
      id: imageFoodProductsTable.foodProductId,
      similarity,
      score: foodProductPublicView.score,
    })
    .from(imageFoodProductsTable)
    .innerJoin(
      foodProductPublicView,
      eq(foodProductPublicView.id, imageFoodProductsTable.foodProductId)
    )
    .where(
      and(
        eq(foodProductPublicView.foodCategoryId, category),
        eq(imageFoodProductsTable.type, "front"),
        isNotNull(imagesTable.embedding),
        gt(similarity, 0.5)
      )
    )
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .orderBy((t) => desc(t.similarity))
    .limit(limit)

  return similarProducts;
};

export const findRelatedFoodProductByVector = async ({
  embedding,
  category,
  limit = 10,
  excludeProductID,
}: {
  embedding: number[];
  category: number;
  limit?: number;
  excludeProductID: number;
}) => {
  const similarity = sql<number>`1 - (${cosineDistance(
    imagesTable.embedding,
    embedding
  )})`;

  const similarProducts = await db
    .select({
      id: imageFoodProductsTable.foodProductId,
      similarity,
      score: foodProductPublicView.score,
      nutrition: nutritionInfoTable,
      additives: foodProductPublicView.additives,
    })
    .from(imageFoodProductsTable)
    .innerJoin(
      foodProductPublicView,
      eq(foodProductPublicView.id, imageFoodProductsTable.foodProductId)
    )
    .leftJoin(
      nutritionInfoTable,
      eq(nutritionInfoTable.foodProductId, imageFoodProductsTable.foodProductId)
    )
    .where(
      and(
        ne(imageFoodProductsTable.foodProductId, excludeProductID),
        eq(foodProductPublicView.foodCategoryId, category),
        eq(imageFoodProductsTable.type, "front"),
        isNotNull(imagesTable.embedding),
        gt(similarity, 0.5)
      )
    )
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);

  return similarProducts;
};
