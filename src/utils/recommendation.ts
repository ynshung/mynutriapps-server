import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  userProductClicksTable,
} from "../db/schema";
import { findSimilarFoodProductByVector } from "./frontImageVector";

export const getHistoryRecommendation = async (userID: number) => {
  const data = await db
    .select({
      productID: userProductClicksTable.foodProductId,
      embedding: imagesTable.embedding,
      category: foodProductsTable.foodCategoryId,
      timestamp: userProductClicksTable.clickedAt,
    })
    .from(userProductClicksTable)
    .innerJoin(
      foodProductsTable,
      eq(userProductClicksTable.foodProductId, foodProductsTable.id)
    )
    .innerJoin(
      imageFoodProductsTable,
      eq(
        imageFoodProductsTable.foodProductId,
        userProductClicksTable.foodProductId
      )
    )
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .where(
      and(
        eq(userProductClicksTable.userID, userID),
        isNotNull(imagesTable.embedding)
      )
    )
    .orderBy(desc(userProductClicksTable.clickedAt));

  const groupedData = data.reduce((acc, item) => {
    const { category, embedding, timestamp, productID } = item;
    if (!acc[category]) {
      acc[category] = { embeddings: [], timestamps: [], productIDs: [] };
    }
    if (embedding) {
      acc[category].embeddings.push(embedding);
      acc[category].timestamps.push(new Date(timestamp).getTime());
      acc[category].productIDs.push(productID);
    }
    return acc;
  }, {} as Record<number, { embeddings: number[][]; timestamps: number[]; productIDs: number[] }>);

  // Check if for each category we have at least 5 unique productID and 10 total clicks
  const filteredCategories = Object.entries(groupedData).filter(
    ([, { productIDs, timestamps }]) => {
      const uniqueProductIDs = new Set(productIDs);
      return uniqueProductIDs.size >= 5 && timestamps.length >= 10;
    }
  );

  const meanEmbeddingByCategory = filteredCategories
    .map(([category, { embeddings, timestamps }]) => {
      const totalClicks = timestamps.length;
      if (totalClicks < 10) {
        return null;
      }

      const maxTimestamp = Math.max(...timestamps);
      const minTimestamp = Math.min(...timestamps);
      const range = maxTimestamp - minTimestamp || 1; // avoid division by zero

      // Normalize timestamps to weights (newer = closer to max = higher weight)
      const weights = timestamps.map((ts) => (ts - minTimestamp) / range);

      // Compute weighted mean embedding
      const meanEmbedding = embeddings[0].map((_, i) => {
        let weightedSum = 0;
        let totalWeight = 0;
        for (let j = 0; j < embeddings.length; j++) {
          const weight = weights[j];
          weightedSum += embeddings[j][i] * weight;
          totalWeight += weight;
        }
        return weightedSum / totalWeight;
      });

      return {
        category: Number(category),
        meanEmbedding,
        maxTimestamp,
        totalClicks,
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => b.maxTimestamp - a.maxTimestamp);

  const topProducts: {
    id: number;
    similarity: number;
  }[] = [];

  await Promise.all(
    meanEmbeddingByCategory.map(async (item) => {
      const similarProducts = await findSimilarFoodProductByVector({
        embedding: item.meanEmbedding,
        category: item.category,
        limit: 100,
      });
      topProducts.push(...similarProducts);
    })
  );

  return topProducts.sort((a, b) => b.similarity - a.similarity);
};
