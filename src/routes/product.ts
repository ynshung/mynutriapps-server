import { Request, Response } from "express";
import { db } from "@src/db";
import { desc, eq } from "drizzle-orm";
import {
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  foodCategoryTable,
  userProductClicksTable,
} from "@src/db/schema";
import { ProductCardType } from "@/types";
import { logger } from "@src/utils/logger";
import { processFrontLabel } from "../ai/productFrontLabel";
import { processNutritionLabelV2 } from "../ai/productNutritionLabel";
import { processIngredientsLabel } from "../ai/productIngredients";
import {
  createNewProductNutrition,
  getProductData,
  uploadProductImages,
} from "../utils/product";

export const listProducts = async (req: Request, res: Response) => {
  const data = await db
    .selectDistinctOn([foodProductsTable.id], {
      id: foodProductsTable.id,
      name: foodProductsTable.name,
      barcode: foodProductsTable.barcode,
      brand: foodProductsTable.brand,
      category: foodCategoryTable.name,
      image: imagesTable.imageKey,
      verified: foodProductsTable.verified,
    })
    .from(foodProductsTable)
    .innerJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, foodProductsTable.id)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .innerJoin(
      foodCategoryTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    )
    .where(eq(imageFoodProductsTable.type, "front"))
    .orderBy(desc(foodProductsTable.id));

  res.json(data);
};

export const listRecentlyViewedProducts = async (
  id: number
): Promise<ProductCardType[]> => {
  const subquery = db
    .selectDistinctOn([userProductClicksTable.foodProductId])
    .from(userProductClicksTable)
    .where(eq(userProductClicksTable.userID, id))
    .orderBy(
      desc(userProductClicksTable.foodProductId),
      desc(userProductClicksTable.clickedAt)
    )
    .as("user");

  const products = await db
    .select({
      id: foodProductsTable.id,
      name: foodProductsTable.name,
      brand: foodProductsTable.brand,
      category: foodCategoryTable.name,
      image: imagesTable.imageKey,
      verified: foodProductsTable.verified,
    })
    .from(subquery)
    .orderBy(desc(subquery.clickedAt))
    .innerJoin(
      foodProductsTable,
      eq(subquery.foodProductId, foodProductsTable.id)
    )
    .innerJoin(
      foodCategoryTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    )
    .innerJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, foodProductsTable.id)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .where(eq(imageFoodProductsTable.type, "front"))
    .limit(8);

  return products;
};

export const getProduct = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const userId = req.query.userId ? parseInt(req.query.userId as string) : null;

  // Process images
  const foodProductDetails = await getProductData(id);
  if (!foodProductDetails) {
    res.status(404).json({
      status: "error",
      message: "Product not found",
    });
    return;
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
  const [frontLabelData, nutritionLabelData, ingredientsData] =
    await Promise.all([
      processFrontLabel(images.frontLabel.buffer),
      images.nutritionLabel
        ? processNutritionLabelV2(images.nutritionLabel.buffer)
        : Promise.resolve(undefined),
      images.ingredients
        ? processIngredientsLabel(images.ingredients.buffer)
        : Promise.resolve(undefined),
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
      await uploadProductImages(
        productId,
        {
          frontLabelImage: images.frontLabel,
          nutritionLabelImage: images.nutritionLabel,
          ingredientsImage: images.ingredients,
        },
        userID,
        tx
      );

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
