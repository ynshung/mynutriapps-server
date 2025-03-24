import { NutritionDetails, NutritionInfo, NutritionInfoFull } from "@/types/prompt";
import {
  foodProductsTable,
  imageFoodProductsTable,
  nutritionInfoTable,
} from "../db/schema";
import { NewFoodProductFormData } from "@/types";
import { toArray, toStrOrNull, toValidStringArrayOrNull } from "./type";
import { uploadImage } from "./image";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "../db";

export const createNewProduct = async (
  newProduct: NewFoodProductFormData,
  tx: NodePgDatabase = db
) => {
  return await tx.transaction(async (db) => {
    const id = await db
      .insert(foodProductsTable)
      .values({
        name: newProduct.name,
        brand: newProduct.brand,
        foodCategoryId: parseInt(newProduct.category),
        barcode: toArray(newProduct.barcode),
        ingredients: newProduct.ingredients,
        additives: toArray(newProduct.additives),
        allergens: toArray(newProduct.allergens),
      })
      .returning({ id: foodProductsTable.id });
    await createNewProductNutrition(id[0].id, newProduct, db);

    return id[0].id;
  });
};

export const createNewProductNutrition = async (
  foodProductId: number,
  newProduct: NewFoodProductFormData | NutritionInfoFull,
  tx: NodePgDatabase = db
) => {
  await tx.insert(nutritionInfoTable).values({
    foodProductId: foodProductId,
    servingSize: toStrOrNull(newProduct.servingSize),
    servingSizeUnit: newProduct.servingSizeUnit,
    servingSizePerUnit: toStrOrNull(newProduct.servingSizePerUnit),
    calories: toStrOrNull(newProduct.calories),
    fat: toStrOrNull(newProduct.fat),
    carbs: toStrOrNull(newProduct.carbs),
    protein: toStrOrNull(newProduct.protein),
    sugar: toStrOrNull(newProduct.sugar),
    monounsaturatedFat: toStrOrNull(newProduct.monounsaturatedFat),
    polyunsaturatedFat: toStrOrNull(newProduct.polyunsaturatedFat),
    saturatedFat: toStrOrNull(newProduct.saturatedFat),
    transFat: toStrOrNull(newProduct.transFat),
    cholesterol: toStrOrNull(newProduct.cholesterol),
    sodium: toStrOrNull(newProduct.sodium),
    fiber: toStrOrNull(newProduct.fiber),
    vitamins: toValidStringArrayOrNull(newProduct.vitamins),
    minerals: toValidStringArrayOrNull(newProduct.minerals),
    uncategorized: toValidStringArrayOrNull(newProduct.uncategorized),
  });
}

export const uploadProductImages = async (
  productId: number,
  images: {
    frontLabelImage?: Express.Multer.File;
    nutritionLabelImage?: Express.Multer.File;
    ingredientsImage?: Express.Multer.File;
  },
  userID: number = -1,
  tx: NodePgDatabase = db
) => {
  await Promise.all(
    Object.keys(images).map(async (key) => {
      const image = images[key as keyof typeof images];
      if (image) {
        const imageID = await uploadImage(image, userID);

        await tx.insert(imageFoodProductsTable).values({
          foodProductId: productId,
          imageId: imageID,
          type:
            key === "frontLabelImage"
              ? "front"
              : key === "nutritionLabelImage"
              ? "nutritional_table"
              : key === "ingredientsImage"
              ? "ingredients"
              : "other",
        });
      }
    })
  );
};

/**
 * @deprecated
 */
export const processProductNutrition = (
  productID: number,
  foodNutrition: NutritionInfo
): typeof nutritionInfoTable.$inferInsert => {
  const result: typeof nutritionInfoTable.$inferInsert = {
    foodProductId: productID,
    // rawJSON: foodNutrition,
    servingSize: foodNutrition.servingSize?.toString(),
    servingSizeUnit: foodNutrition.servingSizeUnit,
    servingSizePerUnit: foodNutrition.servingSizePerUnit?.toString(),
  };

  // For each key in perServing, if it doesn't exist in per100g, convert to per100g
  if (foodNutrition.servingSize) {
    foodNutrition.per100g = foodNutrition.per100g || {};
    for (const key in foodNutrition.perServing) {
      if (!(key in foodNutrition.per100g)) {
        const conversionFactor = 100 / foodNutrition.servingSize;
        const value = foodNutrition.perServing[key as keyof NutritionDetails];
        if (value !== undefined) {
          foodNutrition.per100g[key as keyof NutritionDetails] =
            value * conversionFactor;
        }
      }
    }
  }

  // Assign per100g to result
  for (const key in foodNutrition.per100g) {
    if (key === "caloriesKcal" && foodNutrition.per100g?.caloriesKcal) {
      result.calories = foodNutrition.per100g.caloriesKcal.toString();
    } else if (
      key === "caloriesKJ" &&
      foodNutrition.per100g?.caloriesKJ &&
      !foodNutrition.per100g?.caloriesKcal
    ) {
      result.calories = (foodNutrition.per100g.caloriesKJ * 0.239).toString();
    } else {
      result[
        key as keyof Omit<NutritionDetails, "caloriesKcal" | "caloriesKJ">
      ] = foodNutrition.per100g[key as keyof NutritionDetails]?.toString();
    }
  }

  return result;
};
