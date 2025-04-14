import { db } from "@/src/db";
import { foodProductsTable, imageFoodProductsTable, imagesTable } from "@/src/db/schema";
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
    Bucket: "mynutriapps",
    Key: imageKey,
  });
  const response = await s3.send(command);
  const arrayBuffer = await response.Body?.transformToByteArray();
  const imageBlob = arrayBuffer ? new Blob([arrayBuffer]) : null;

  return imageBlob;
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

listFoodProductFrontImageUnvectorized().then(async (data) => {
  if (!data || data.length === 0) {
    console.log("No images to process");
    return;
  }
  for (const item of data) {
    const imageKey = item.imageKey;
    console.log("Processing image:", imageKey);

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
});

export const findSimilarFoodProduct = async (productID: number) => {
  const product = await db
    .select({ embedding: imagesTable.embedding, category: foodProductsTable.foodCategoryId })
    .from(imageFoodProductsTable)
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .innerJoin(
      foodProductsTable,
      eq(foodProductsTable.id, imageFoodProductsTable.foodProductId)
    )
    .where(
      and(
        eq(imageFoodProductsTable.foodProductId, productID),
        eq(imageFoodProductsTable.type, "front")
      )
    )
    .limit(1);

  if (product.length === 0) {
    console.log("No product found for product ID:", productID);
    return null;
  }

  const { embedding, category } = product[0];

  if (!embedding) {
    console.log("No embedding found for product ID:", productID);
    return null;
  }

  const similarity = sql<number>`1 - (${cosineDistance(
    imagesTable.embedding,
    embedding
  )})`;

  const similarProducts = await db
    .select({
      id: imageFoodProductsTable.foodProductId,
      similarity,
    })
    .from(imageFoodProductsTable)
    .innerJoin(
      foodProductsTable,
      eq(foodProductsTable.id, imageFoodProductsTable.foodProductId)
    )
    .where(
      and(
        ne(imageFoodProductsTable.foodProductId, productID),
        eq(foodProductsTable.foodCategoryId, category),
        eq(imageFoodProductsTable.type, "front"),
        isNotNull(imagesTable.embedding),
        gt(similarity, 0.5)
      )
    )
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .orderBy((t) => desc(t.similarity))
    .limit(8);

  return similarProducts;
};
