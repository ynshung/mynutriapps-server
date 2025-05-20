import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  foodProductPublicView,
  foodProductsTable,
  goalEnum,
  GoalType,
  imageFoodProductsTable,
  imagesTable,
  nutritionInfoTable,
  ProductScore,
  userProductClicksTable,
} from "../db/schema";
import {
  findRelatedFoodProductByVector,
  findSimilarFoodProductByVector,
} from "./frontImageVector";
import {
  NUTRITION_FACT_KEYS,
  NutritionFactKey,
} from "@/src/utils/evaluateNutritionQuartiles";
import { getProductCard } from "./product";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

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
const getCategoryProductScore = async (
  categoryID: number,
  goal: GoalType,
  quartile: number = 6,
  tx: NodePgDatabase = db
) => {
  const categoriesProduct = await tx
    .select()
    .from(foodProductPublicView)
    .innerJoin(
      nutritionInfoTable,
      eq(nutritionInfoTable.foodProductId, foodProductPublicView.id)
    )
    .leftJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, foodProductPublicView.id)
    )
    .where(
      and(
        eq(foodProductPublicView.foodCategoryId, categoryID),
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
  const additivesLengths = categoriesProduct
    .map((product) => product.food_product_public_view.additives?.length)
    .filter((length) => length !== undefined);

  const minAdditivesLength = Math.min(...additivesLengths);
  const maxAdditivesLength = Math.max(...additivesLengths);

  // Normalize nutrition info using z-score
  const normalizedProducts = categoriesProduct.map((product) => {
    const normalizedNutrition = nutritionKeys.reduce((acc, key) => {
      if (
        product.nutrition_info[key] === null ||
        product.nutrition_info[key] === undefined
      )
        return acc;
      const value = parseFloat(product.nutrition_info[key].toString());
      if (value) {
        const { mean, stdDev } = stats[key];
        acc[key] = stdDev === 0 ? 0 : (value - mean) / stdDev;
      }
      return acc;
    }, {} as Record<NutritionFactKey, number>);

    // Normalize additives length
    const normalizedAdditivesLength =
      product.food_product_public_view.additives?.length === undefined
        ? undefined
        : maxAdditivesLength === minAdditivesLength
        ? 0
        : (product.food_product_public_view.additives.length - minAdditivesLength) /
          (maxAdditivesLength - minAdditivesLength);

    return {
      ...product,
      normalizedNutrition,
      normalizedAdditivesLength,
    };
  });

  const recommendedProduct: (ProductScore & { id: number })[] = [];

  for (const product of normalizedProducts) {
    const returnObject: (typeof recommendedProduct)[number] = {
      id: product.food_product_public_view.id,
      scoreBreakdown: {},
      total: 0,
    };
    const score = Object.entries(healthGoalWeightage[goal]).reduce(
      (acc, [key, weight]) => {
        if (weight === 0) return acc;

        const isAdditives = key === "additives";
        const value = isAdditives
          ? product.normalizedAdditivesLength
          : product.normalizedNutrition[key as NutritionFactKey];

        if (value !== undefined || (value === 0 && isAdditives)) {
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
    if (returnObject.total >= 3) {
      recommendedProduct.push(returnObject);
    }
  }

  const sortedProducts = recommendedProduct.sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );

  // Determine quartile ranges
  const quartileSize = Math.ceil(sortedProducts.length / quartile);

  sortedProducts.forEach((product, index) => {
    const quartileIndex = Math.floor(index / quartileSize) + 1;
    product.quartile = quartileIndex <= quartile ? quartileIndex : quartile;
  });

  return sortedProducts;
};

export const setCategoryProductScore = async (categoryID: number, tx: NodePgDatabase = db) => {
  if (categoryID === 0) return null;
  const productsList: Map<number, typeof foodProductsTable.$inferSelect.score> =
    new Map();

  for (const goal of goalEnum.enumValues) {
    const recommendations = await getCategoryProductScore(categoryID, goal, undefined, tx);
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
    await tx
      .update(foodProductsTable)
      .set({
        score: productData,
      })
      .where(eq(foodProductsTable.id, productID));
  }

  return productsList;
};

// TODO: Check behaviour in new accounts
export const getHistoryRecommendation = async (userID: number, userGoal: GoalType) => {
  const data = await db
    .select({
      productID: userProductClicksTable.foodProductId,
      embedding: imagesTable.embedding,
      category: foodProductPublicView.foodCategoryId,
      timestamp: userProductClicksTable.clickedAt,
    })
    .from(userProductClicksTable)
    .innerJoin(
      foodProductPublicView,
      eq(userProductClicksTable.foodProductId, foodProductPublicView.id)
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
    score: number | undefined;
  }[] = [];

  await Promise.all(
    meanEmbeddingByCategory.map(async (item) => {
      const similarProducts = await findSimilarFoodProductByVector({
        embedding: item.meanEmbedding,
        category: item.category,
        limit: 100,
      });
      const similarProductsWithScore = similarProducts.map((product) => ({
        id: product.id,
        similarity: product.similarity,
        score: product.score?.[userGoal]?.score,
      }));
      topProducts.push(...similarProductsWithScore);
    })
  );

  return topProducts
    .map((product) => ({
      ...product,
      // Same as recommendation score for individual product
      // TODO: extract to a formula function?
      weightedScore:
        product.score !== undefined
          ? (product.similarity * 0.5) +
            (1 / (1 + Math.exp(-product.score))) * 0.5
          : product.similarity * 0.5,
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore);
};

export const findRelatedProducts = async (
  productID: number,
  goal: GoalType = "improveHealth"
) => {
  const product = await db
    .select({
      embedding: imagesTable.embedding,
      category: foodProductPublicView.foodCategoryId,
      score: foodProductPublicView.score,
      nutrition: nutritionInfoTable,
      additives: foodProductPublicView.additives,
    })
    .from(imageFoodProductsTable)
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
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
        eq(imageFoodProductsTable.foodProductId, productID),
        eq(imageFoodProductsTable.type, "front")
      )
    )
    .limit(1);

  if (product.length === 0) {
    console.log("No product found for product ID:", productID);
    return null;
  }
  // TODO: Product with no nutrition info
  // Must check if the product has a nutrition info for related products
  // or else just recommend the most similar product + healthiest product
  // (I think currently it works out of the box but might check if there is any bugs)

  const currentProduct = product[0];

  if (!currentProduct.embedding) {
    console.log("No embedding found for product ID:", productID);
    return null;
  }

  const similarProductsID = await findRelatedFoodProductByVector({
    embedding: currentProduct.embedding,
    category: currentProduct.category,
    limit: 128,
    excludeProductID: productID,
  });

  const filteredProducts = similarProductsID.filter(
    (product) => product.score !== null
  );

  const currentProductNutrition = currentProduct.nutrition;
  const recommendedProducts = filteredProducts
    .map((newProduct) => {
      const newProductScore = newProduct.score?.[goal]?.score;
      if (!newProductScore) {
        return null;
      }

      if (
        Object.keys(newProduct.score?.[goal]?.scoreBreakdown ?? {}).length <= 3
      ) {
        return null;
      }

      const weightedScore =
        (newProduct.similarity * 0.5) +
        (1 / (1 + Math.exp(-newProductScore))) * 0.5;

      const nutritionComparison: Record<string, number> = {};
      const nutritionMoreIsBetterUserGoal: Record<string, boolean> = {};

      if (currentProductNutrition) {
        const newNutrition = newProduct.nutrition;
        if (!newNutrition) return null;
        for (const key of NUTRITION_FACT_KEYS) {
          const currentValue = currentProductNutrition[key];
          const newValue = newNutrition[key];

          if (
            currentValue &&
            newValue &&
            healthGoalWeightage[goal][key] !== 0
          ) {
            const valueDiff =
              (Number(newValue) - Number(currentValue)) /
              Math.abs(Number(currentValue));
            const weight = healthGoalWeightage[goal][key] ?? 1;
            nutritionComparison[key] = valueDiff;
            nutritionMoreIsBetterUserGoal[key] = weight > 0;
          }
        }
        // Add additives length comparison
        if (currentProduct.additives && newProduct.additives) {
          const currentAdditivesLength = currentProduct.additives.length;
          const newAdditivesLength = newProduct.additives.length;

          const additivesDiff = newAdditivesLength - currentAdditivesLength;
          const weight = healthGoalWeightage[goal].additives ?? 1;
          nutritionComparison.additives = additivesDiff;
          nutritionMoreIsBetterUserGoal.additives = weight > 0;
        }
      }

      return {
        ...newProduct,
        weightedScore, // Score that takes into account similarity and healthiness
        score: newProductScore,
        scoreDiff:
          newProductScore - (currentProduct.score?.[goal]?.score ?? Infinity),
        nutritionComparison,
        nutritionMoreIsBetterUserGoal,
      };
    })
    .filter((newProduct) => newProduct !== null)
    .sort((a, b) => b.weightedScore - a.weightedScore)

  return {
    recommendedProducts,
    similarProducts: similarProductsID.map((product) => ({
      id: product.id,
      similarity: product.similarity,
    })),
  };
};

export const findRelatedProductsCards = async (
  productID: number,
  userID?: number,
  userGoal: GoalType = "improveHealth",
  slice: number = 8
) => {
  const products = await findRelatedProducts(productID, userGoal);
  if (!products) {
    return null;
  }

  const productsID = new Set(
    [...products.recommendedProducts, ...products.similarProducts].map(
      (item) => item.id
    )
  );
  const productData = await Promise.all(
    Array.from(productsID).map(async (id) => {
      const product = await getProductCard(Number(id), userID);
      return product;
    })
  );

  return {
    recommendedProducts: products.recommendedProducts
      .map((item) => {
        return {
          ...productData.find((product) => product.id === item.id),
          recommended: item,
        };
      })
      .filter((product) => product.allergens !== true)
      .slice(0, slice),
    similarProducts: products.similarProducts
      .map((item) => productData.find((product) => product.id === item.id))
      .filter((product) => product !== undefined)
      .slice(0, slice),
  };
};
