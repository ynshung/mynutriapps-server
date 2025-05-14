import {
  NutritionDetails,
  NutritionInfo,
  NutritionInfoFull,
} from "@/types/prompt";
import {
  foodCategoryTable,
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  nutritionInfoTable,
  userProductFavoritesTable,
} from "../db/schema";
import { NewFoodProductFormData, ServerFoodProductDetails } from "@/types";
import { toArray, toStrOrNull, toValidStringArrayOrNull } from "./type";
import { uploadImage } from "./image";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { processUnvectorizedImages } from "./frontImageVector";
import { productsQuery } from "../routes/product";
import { evaluateNutritionQuartiles } from "@/utils/evaluateNutritionQuartiles";
import { setCategoryProductScore } from "./recommendation";

export const getProductData = async (id: number, userId?: number) => {
  const data = await db
    .select()
    .from(foodProductsTable)
    .where(eq(foodProductsTable.id, id))
    .leftJoin(
      nutritionInfoTable,
      eq(foodProductsTable.id, nutritionInfoTable.foodProductId)
    )
    .innerJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, foodProductsTable.id)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .innerJoin(
      foodCategoryTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    );

  const foodProduct = data[0];
  // Check if product exists
  if (!foodProduct) {
    return null;
  }

  let isUserFavorite = false;
  if (userId) {
    const favoriteQuery = await db
      .select()
      .from(userProductFavoritesTable)
      .where(
        and(
          eq(userProductFavoritesTable.userID, userId),
          eq(userProductFavoritesTable.foodProductId, id)
        )
      );
    isUserFavorite = favoriteQuery.length > 0;
  }

  const quartiles = await evaluateNutritionQuartiles(foodProduct.food_category.id);
  const productQuartiles = quartiles.find(
    (item) => item.id === foodProduct.food_products.id
  )?.quartiles;

  // Process images
  const foodProductDetails: ServerFoodProductDetails = {
    ...foodProduct,
    images: [],
    isUserFavorite,
    quartiles: productQuartiles,
  };
  for (const obj of data) {
    const existingImage = foodProductDetails.images.find(
      (img) => img.id === obj.images.id
    );
    if (!existingImage) {
      foodProductDetails.images.push({
        ...obj.images,
        type: obj.image_food_products.type ?? "other",
        embedding: null,
      });
    }
  }
  return foodProductDetails;
};

export const getProductCard = async (productID: number, userID?: number) => {
  const data = await productsQuery({ userID })
    .where(eq(foodProductsTable.id, productID))
    .limit(1);

  return data[0];
};

export const getProductImages = async (id: number) => {
  const data = await db
    .select({
      key: imagesTable.imageKey,
      type: imageFoodProductsTable.type,
    })
    .from(imageFoodProductsTable)
    .where(eq(imageFoodProductsTable.foodProductId, id))
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id));

  return data.reduce<Record<string, string>>((acc, curr) => {
    acc[curr.type] = curr.key;
    return acc;
  }, {});
};

export const getFullProducts = async (
  products: { id: number; [key: string]: unknown }[]
) => {
  // TODO: Might need further optimization as each product is fetched individually
  // Maybe use JSON agg?
  return await Promise.all(
    products.map(async (product) => {
      return {
        ...product,
        images: await getProductImages(product.id),
      };
    })
  );
};

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
        verified: newProduct.verified === "on",
      })
      .returning({ id: foodProductsTable.id });
    await createNewProductNutrition(id[0].id, newProduct, db);
    setCategoryProductScore(parseInt(newProduct.category));

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
};

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
      if (image && image.size > 0) {
        const { imageID } = await uploadImage(image, userID);

        const keyType =
          key === "frontLabelImage"
            ? "front"
            : key === "nutritionLabelImage"
            ? "nutritional_table"
            : key === "ingredientsImage"
            ? "ingredients"
            : "other";

        const existingImage = await tx
          .select()
          .from(imageFoodProductsTable)
          .where(
            and(
              eq(imageFoodProductsTable.foodProductId, productId),
              eq(imageFoodProductsTable.type, keyType)
            )
          );
        if (existingImage.length > 0) {
          await tx
            .delete(imageFoodProductsTable)
            .where(
              and(
                eq(imageFoodProductsTable.foodProductId, productId),
                eq(imageFoodProductsTable.type, keyType)
              )
            );
        }

        await tx.insert(imageFoodProductsTable).values({
          foodProductId: productId,
          imageId: imageID,
          type: keyType,
        });
      }
    })
  );
  processUnvectorizedImages();
};

export const checkRemovedImages = async (
  productId: number,
  formData: NewFoodProductFormData,
  images: { [fieldname: string]: Express.Multer.File[] } | undefined,
) => {
  const { front_label_url, nutrition_label_url, ingredients_url } = formData;

  const existingImages = await db
    .select()
    .from(imageFoodProductsTable)
    .where(eq(imageFoodProductsTable.foodProductId, productId));
    
  const types = ["front", "nutritional_table", "ingredients"];
  for (const type of types) {
    const formDataUrl =
      type === "front"
        ? front_label_url
        : type === "nutritional_table"
        ? nutrition_label_url
        : ingredients_url;

    const imageExistsInFormData = formDataUrl && formDataUrl.trim() !== "";
    const imageExistsInUploadedImages =
      type === "front"
      ? images?.front_label?.[0]
      : type === "nutritional_table"
      ? images?.nutrition_label?.[0]
      : type === "ingredients"
      ? images?.ingredients?.[0]
      : false;

    if (!imageExistsInFormData && !imageExistsInUploadedImages) {
      const existingImage = existingImages.find(
        (img) => img.type === type
      );
      if (existingImage) {
        await db
          .delete(imageFoodProductsTable)
          .where(
            and(
              eq(imageFoodProductsTable.foodProductId, existingImage.foodProductId),
              eq(imageFoodProductsTable.imageId, existingImage.imageId),
              eq(imageFoodProductsTable.type, existingImage.type)
            )
          );
      }
    }
  }
}

export const editProductData = async (
  newId: number,
  newProduct: NewFoodProductFormData,
  tx: NodePgDatabase = db
) => {
  await tx
    .update(foodProductsTable)
    .set({
      name: newProduct.name,
      brand: newProduct.brand,
      foodCategoryId: parseInt(newProduct.category),
      barcode: toArray(newProduct.barcode),
      ingredients: newProduct.ingredients,
      additives: toArray(newProduct.additives),
      allergens: toArray(newProduct.allergens),
      verified: newProduct.verified === "on",
    })
    .where(eq(foodProductsTable.id, newId));

  const existingNutritionInfo = await tx
    .select()
    .from(nutritionInfoTable)
    .where(eq(nutritionInfoTable.foodProductId, newId));

  if (existingNutritionInfo.length > 0) {
    await tx
      .update(nutritionInfoTable)
      .set({
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
      })
      .where(eq(nutritionInfoTable.foodProductId, newId));
  } else {
    await tx.insert(nutritionInfoTable).values({
      foodProductId: newId,
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
  setCategoryProductScore(parseInt(newProduct.category));
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
