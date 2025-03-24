import { Request, Response } from "express";
import { db } from "@src/db";
import { eq } from "drizzle-orm";
import {
  foodProductsTable,
  nutritionInfoTable,
  imageFoodProductsTable,
  imagesTable,
  foodCategoryTable,
  userProductClicksTable,
} from "@src/db/schema";
import { ServerFoodProduct, ServerFoodProductDetails } from "@/types";
import { logger } from "@src/utils/logger";
import { processFrontLabel } from "../ai/productFrontLabel";
import {
  processNutritionLabelV2,
} from "../ai/productNutritionLabel";
import { processIngredientsLabel } from "../ai/productIngredients";
import { createNewProductNutrition, uploadProductImages } from "../utils/product";

export const listProducts = async (req: Request, res: Response) => {
  const data = await db
    .select()
    .from(foodProductsTable)
    .innerJoin(
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

  const reducedData = data.reduce<Record<number, ServerFoodProduct>>(
    (acc, curr) => {
      const foodProductId = curr.food_products.id;
      if (!acc[foodProductId]) {
        acc[foodProductId] = {
          food_products: curr.food_products,
          food_category: curr.food_category,
          images: [
            { ...curr.images, type: curr.image_food_products.type ?? "other" },
          ],
        };
      } else {
        acc[foodProductId].images.push({
          ...curr.images,
          type: curr.image_food_products.type ?? "other",
        });
      }
      return acc;
    },
    {}
  );

  res.json(reducedData);
};

export const getProduct = async (req: Request, res: Response) => {
  // TODO: Abstract this into a function since scanning barcode will be another endpoint
  const id = parseInt(req.params.id);
  const userId = req.query.user_id
    ? parseInt(req.query.user_id as string)
    : null;
  const data = await db
    .select()
    .from(foodProductsTable)
    .where(eq(foodProductsTable.id, id))
    .innerJoin(
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
    res.status(404).json({
      status: "error",
      message: "Product not found",
    });
    return;
  }

  // Process images
  const foodProductDetails: ServerFoodProductDetails = {
    ...foodProduct,
    images: [],
  };
  for (const obj of data) {
    const existingImage = foodProductDetails.images.find(
      (img) => img.id === obj.images.id
    );
    if (!existingImage) {
      foodProductDetails.images.push({
        ...obj.images,
        type: obj.image_food_products.type ?? "other",
      });
    }
  }

  res.json(foodProductDetails);

  if (userId) {
    await db
      .insert(userProductClicksTable)
      .values({
        userID: userId,
        foodProductId: id,
      })
      .execute();
  }
};

export const createProduct = async (
  barcode: string,
  userID: number,
  images: {
    frontLabel: Express.Multer.File;
    nutritionLabel?: Express.Multer.File;
    ingredients?: Express.Multer.File;
  }
) => {
  const [frontLabelData, nutritionLabelData, ingredientsData] = await Promise.all([
    processFrontLabel(images.frontLabel),
    images.nutritionLabel ? processNutritionLabelV2(images.nutritionLabel) : Promise.resolve(undefined),
    images.ingredients ? processIngredientsLabel(images.ingredients) : Promise.resolve(undefined),
  ]);

  // Save product to database
  return await db.transaction(async (tx) => {
    try {
      let categoryId: number | undefined;
      // (1) Food Category
      const categoryQueryResult = await tx
        .select()
        .from(foodCategoryTable)
        .where(eq(foodCategoryTable.name, frontLabelData.category));
      if (categoryQueryResult.length === 0) {
        throw new Error("Unexpected error: Category not found");
      } else {
        categoryId = categoryQueryResult[0].id;
      }

      // (2) Food Product
      let newProductValues: typeof foodProductsTable.$inferInsert = {
        barcode: [barcode],
        name: frontLabelData.name,
        brand: frontLabelData.brand,
        foodCategoryId: categoryId ?? 0, // Uncategorized if undefined
      };

      // (2.5) Ingredients
      if (ingredientsData) {
        newProductValues = {
          ...newProductValues,
          ingredients: ingredientsData.ingredients,
          allergens: ingredientsData.allergens as string[] | undefined,
          additives: ingredientsData.additives as string[] | undefined,
        };
      }

      const newProductEntry = await tx
        .insert(foodProductsTable)
        .values(newProductValues)
        .returning();

      const productId = newProductEntry[0].id;

      // (3) Nutrition Info
      if (nutritionLabelData && nutritionLabelData.extractableTable) {
        await createNewProductNutrition(productId, nutritionLabelData, tx);
      }

      // (4) Images
      await uploadProductImages(productId, {
        frontLabelImage: images.frontLabel,
        nutritionLabelImage: images.nutritionLabel,
        ingredientsImage: images.ingredients,
      }, userID, tx);

      return {
        status: "success",
        data: {
          product: newProductEntry[0],
          nutritionInfo: nutritionLabelData,
          ingredients: ingredientsData,
        },
      };
    } catch (error) {
      logger.error(error);
      tx.rollback();
      return;
    }
  });
};
