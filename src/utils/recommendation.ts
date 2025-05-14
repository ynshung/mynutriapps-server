import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  foodProductsTable,
  goalEnum,
  GoalType,
  imageFoodProductsTable,
  imagesTable,
  nutritionInfoTable,
  ProductScore,
  userProductClicksTable,
} from "../db/schema";
import { findSimilarFoodProductByVector } from "./frontImageVector";
import { NutritionFactKey } from "@/utils/evaluateNutritionQuartiles";

const healthGoalWeightage: Record<
  GoalType,
  Partial<Record<NutritionFactKey | "additives", number>>
> = {
  improveHealth: {
    calories: 0.0,
    fat: 0.0,
    carbs: 0.0,
    protein: 0.5,
    sugar: -0.5,
    monounsaturatedFat: 0.5,
    polyunsaturatedFat: 0.5,
    saturatedFat: -1.0,
    transFat: -1.5,
    cholesterol: 0.0,
    sodium: -1.0,
    fiber: 0.8,
    additives: -1.0,
  },
  loseWeight: {
    calories: -1.0,
    fat: -0.5,
    carbs: -1.0,
    protein: 1.0,
    sugar: -1.0,
    monounsaturatedFat: 0.8,
    polyunsaturatedFat: 0.8,
    saturatedFat: -1.5,
    transFat: -1.5,
    cholesterol: -0.2,
    sodium: -1.2,
    fiber: 1.5,
    additives: -1.0,
  },
  improvePerformance: {
    calories: 1.0,
    fat: 0.5,
    carbs: 1.0,
    protein: 1.5,
    sugar: -0.8,
    monounsaturatedFat: 1.0,
    polyunsaturatedFat: 1.0,
    saturatedFat: -1.0,
    transFat: -1.5,
    cholesterol: 0.0,
    sodium: -1.0,
    fiber: 0.8,
    additives: -1.0,
  },
  chronicDisease: {
    calories: 0.0,
    fat: 0.0,
    carbs: 0.0,
    protein: 0.5,
    sugar: -1.2,
    monounsaturatedFat: 0.8,
    polyunsaturatedFat: 0.8,
    saturatedFat: -1.5,
    transFat: -1.5,
    cholesterol: -0.5,
    sodium: -1.5,
    fiber: 1.2,
    additives: -1.5,
  },
};

// TODO: Speed up this function
const getCategoryProductScore = async (categoryID: number, goal: GoalType) => {
  const categoriesProduct = await db
    .select()
    .from(foodProductsTable)
    .innerJoin(
      nutritionInfoTable,
      eq(nutritionInfoTable.foodProductId, foodProductsTable.id)
    )
    .leftJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, foodProductsTable.id)
    )
    .leftJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .where(
      and(
        eq(foodProductsTable.foodCategoryId, categoryID),
        eq(imageFoodProductsTable.type, "front")
      )
    );

  // Use z-score normalization for nutrition info
  const nutritionKeys = Object.keys(
    healthGoalWeightage[goal]
  ) as NutritionFactKey[];

  // Calculate mean and standard deviation for each nutrition key
  const stats = nutritionKeys.reduce((acc, key) => {
    const values = categoriesProduct
      .map((product) => product.nutrition_info[key])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => Number(value));

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length
    );

    acc[key] = { mean, stdDev };
    return acc;
  }, {} as Record<NutritionFactKey, { mean: number; stdDev: number }>);

  // Calculate min and max for additives length
  const additivesLengths = categoriesProduct.map(
    (product) => product.food_products.additives?.length || 0
  );

  const minAdditivesLength = Math.min(...additivesLengths);
  const maxAdditivesLength = Math.max(...additivesLengths);

  // Normalize nutrition info using z-score
  const normalizedProducts = categoriesProduct.map((product) => {
    const normalizedNutrition = nutritionKeys.reduce((acc, key) => {
      const value = parseFloat(product.nutrition_info[key]?.toString() ?? "");
      if (value) {
        const { mean, stdDev } = stats[key];
        acc[key] = stdDev === 0 ? 0 : (value - mean) / stdDev;
      }
      return acc;
    }, {} as Record<NutritionFactKey, number>);

    // Normalize additives length
    const normalizedAdditivesLength =
      maxAdditivesLength === minAdditivesLength
        ? 0
        : (product.food_products.additives?.length || 0 - minAdditivesLength) /
          (maxAdditivesLength - minAdditivesLength);

    return {
      ...product,
      normalizedNutrition,
      normalizedAdditivesLength,
    };
  });

  const recommendedProduct: (ProductScore & { id: number })[] = [];

  for (const product of normalizedProducts) {
    const returnObject: typeof recommendedProduct[number] = {
      id: product.food_products.id,
      scoreBreakdown: {},
      total: 0,
    };
    const score = Object.entries(healthGoalWeightage[goal]).reduce(
      (acc, [key, weight]) => {
        if (!weight) return acc;

        const isAdditives = key === "additives";
        const value = isAdditives
          ? product.normalizedAdditivesLength
          : product.normalizedNutrition[key as NutritionFactKey];

        if (value !== undefined) {
          const contribution = weight * value;
          returnObject.scoreBreakdown![key] = contribution;
          returnObject.total += 1;
          return acc + contribution;
        }

        return acc;
      },
      0
    );
    returnObject.score = score;

    recommendedProduct.push(returnObject);
  }

  const sortedProducts = recommendedProduct.sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );

  // Determine quartile ranges
  const quartileSize = Math.ceil(sortedProducts.length / 3);

  sortedProducts.forEach((product, index) => {
    if (index < quartileSize) product.quartile = 1;
    else if (index < quartileSize * 2) product.quartile = 2;
    else product.quartile = 3;
  });

  return sortedProducts;
};

export const setCategoryProductScore = async (categoryID: number) => {
  if (categoryID === 0) return null;
  const productsList: Map<number, typeof foodProductsTable.$inferSelect.score> =
    new Map();

  for (const goal of goalEnum.enumValues) {
    const recommendations = await getCategoryProductScore(categoryID, goal);
    for (const product of recommendations) {
      const productData = productsList.get(product.id) || {};
      productData[goal] = {
        score: product.score,
        total: product.total,
        quartile: product.quartile ?? 0,
        scoreBreakdown: product.scoreBreakdown,
      };
      productsList.set(product.id, productData);
    }
  }

  for (const [productID, productData] of productsList) {
    await db.update(foodProductsTable)
      .set({
        score: productData,
      })
      .where(eq(foodProductsTable.id, productID));
  }

  return productsList;
};

// TODO: Filter by healthiness, check behaviour in new accounts
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
    .orderBy(
      desc(userProductClicksTable.clickedAt),
      desc(imagesTable.uploadedAt)
    );

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
