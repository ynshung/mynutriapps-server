import { Request, Response } from "express";
import { db } from "@src/db";
import { and, arrayOverlaps, desc, eq, getTableColumns, gt, sql } from "drizzle-orm";
import {
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  foodCategoryTable,
  userProductClicksTable,
  userProductFavoritesTable,
  userSearchHistoryTable,
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
import { searchProductsMS, searchSuggestionsMS } from "../utils/minisearch";
import { getCategoryIdByName } from "../utils/category";

// TODO: Generalize the functions in this file, whether to use req, res directly or not

export const listProducts = async (req: Request, res: Response) => {
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;

  let data: ProductCardType[];

  const subquery = db
    .select({
      id: foodProductsTable.id,
      name: sql<string>`${foodProductsTable.name}`.as("product_name"),
      barcode: foodProductsTable.barcode,
      brand: foodProductsTable.brand,
      category: sql<string>`${foodCategoryTable.name}`.as("category_name"),
      image: imagesTable.imageKey,
      verified: foodProductsTable.verified,
      createdAt: foodProductsTable.createdAt,
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
    .orderBy(desc(foodProductsTable.createdAt))
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit))
    .as("subquery");

  if (userID) {
    data = await db
      .select({
        id: subquery.id,
        name: subquery.name,
        barcode: subquery.barcode,
        brand: subquery.brand,
        category: subquery.category,
        image: subquery.image,
        verified: subquery.verified,
        createdAt: subquery.createdAt,
        favorite: sql<boolean>`CASE WHEN ${userProductFavoritesTable.foodProductId} IS NOT NULL THEN TRUE ELSE FALSE END`,
      })
      .from(subquery)
      .leftJoin(
        userProductFavoritesTable,
        and(
          eq(userProductFavoritesTable.foodProductId, subquery.id),
          eq(userProductFavoritesTable.userID, userID)
        )
      )
      .orderBy(desc(subquery.createdAt));
  } else {
    data = await db.select().from(subquery);
  }

  res.json(data);
};

export const listPopularProducts = async (page: number, limit: number, userID?: number) => {
  let data: ProductCardType[];

  const products = db
    .select({
      ...getTableColumns(foodProductsTable),
      clickCount: db.$count(userProductClicksTable, eq(userProductClicksTable.foodProductId, foodProductsTable.id)).as("click_count"),
    })
    .from(foodProductsTable)
    .as("products");
  
  const subquery = db
    .select({
      id: products.id,
      name: sql<string>`${products.name}`.as("product_name"),
      barcode: products.barcode,
      brand: products.brand,
      category: sql<string>`${foodCategoryTable.name}`.as("category_name"),
      image: imagesTable.imageKey,
      verified: products.verified,
      createdAt: products.createdAt,
      clickCount: products.clickCount,
    })
    .from(products)
    .innerJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, products.id)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .innerJoin(
      foodCategoryTable,
      eq(products.foodCategoryId, foodCategoryTable.id)
    )
    .where(and(eq(imageFoodProductsTable.type, "front"), gt(products.clickCount, 0)))
    .orderBy(desc(sql`click_count`))
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit))
    .as("subquery");

  if (userID) {
    data = await db
      .select({
        id: subquery.id,
        name: subquery.name,
        barcode: subquery.barcode,
        brand: subquery.brand,
        category: subquery.category,
        image: subquery.image,
        verified: subquery.verified,
        createdAt: subquery.createdAt,
        clickCount: subquery.clickCount,  
        favorite: sql<boolean>`CASE WHEN ${userProductFavoritesTable.foodProductId} IS NOT NULL THEN TRUE ELSE FALSE END`,
      })
      .from(subquery)
      .leftJoin(
        userProductFavoritesTable,
        and(
          eq(userProductFavoritesTable.foodProductId, subquery.id),
          eq(userProductFavoritesTable.userID, userID)
        )
      )
      .orderBy(desc(sql`click_count`));
  } else {
    data = await db.select().from(subquery);
  }
  
  return data;
};

export const searchBarcode = async (req: Request, res: Response) => {
  const barcode = req.query.q as string;
  const { userID } = req;

  let data: ProductCardType;

  const subquery = db
    .selectDistinctOn([foodProductsTable.id, foodProductsTable.createdAt], {
      id: foodProductsTable.id,
      name: sql<string>`${foodProductsTable.name}`.as("product_name"),
      barcode: foodProductsTable.barcode,
      brand: foodProductsTable.brand,
      category: sql<string>`${foodCategoryTable.name}`.as("category_name"),
      image: imagesTable.imageKey,
      verified: foodProductsTable.verified,
      createdAt: foodProductsTable.createdAt,
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
    .where(
      and(
        arrayOverlaps(foodProductsTable.barcode, [barcode]),
        eq(imageFoodProductsTable.type, "front")
      )
    )
    .orderBy(desc(foodProductsTable.createdAt))
    .as("subquery");

  if (userID) {
    const query = await db
      .select({
        id: subquery.id,
        name: subquery.name,
        barcode: subquery.barcode,
        brand: subquery.brand,
        category: subquery.category,
        image: subquery.image,
        verified: subquery.verified,
        createdAt: subquery.createdAt,
        favorite: sql<boolean>`CASE WHEN ${userProductFavoritesTable.foodProductId} IS NOT NULL THEN TRUE ELSE FALSE END`,
      })
      .from(subquery)
      .leftJoin(
        userProductFavoritesTable,
        and(
          eq(userProductFavoritesTable.foodProductId, subquery.id),
          eq(userProductFavoritesTable.userID, userID)
        )
      )
      .orderBy(desc(subquery.id));
    data = query[0];
  } else {
    const query = await db.select().from(subquery);
    data = query[0];
  }

  if (!data) {
    res.status(404).json({ message: "No product found" });
  }

  res.json(data);
};

export const searchProducts = async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const result = await searchProductsMS(query);
  res.json(result.slice(0, 100));

  await db.insert(userSearchHistoryTable).values({
    userID: req.userID ?? -1,
    searchTerm: query,
    totalSearchResults: result.length,
    searchResults: result.map((r) => r.id.toString()),
  });
};

export const searchSuggestions = async (req: Request, res: Response) => {
  const query = req.query.q as string;
  res.json(await searchSuggestionsMS(query));
};

export const listFavoriteProducts = async (userID: number) => {
  const favorites = await db
    .select({
      id: foodProductsTable.id,
      name: foodProductsTable.name,
      barcode: foodProductsTable.barcode,
      brand: foodProductsTable.brand,
      category: foodCategoryTable.name,
      image: imagesTable.imageKey,
      verified: foodProductsTable.verified,
    })
    .from(userProductFavoritesTable)
    .where(
      and(
        eq(userProductFavoritesTable.userID, userID),
        eq(imageFoodProductsTable.type, "front")
      )
    )
    .innerJoin(
      foodProductsTable,
      eq(userProductFavoritesTable.foodProductId, foodProductsTable.id)
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
    .orderBy(desc(userProductFavoritesTable.favoritedAt));

  return favorites;
};

export const listRecentlyViewedProducts = async (
  id: number,
  page: number = 1,
  limit: number = 10
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
      createdAt: foodProductsTable.createdAt,
      favorite: sql<boolean>`CASE WHEN ${userProductFavoritesTable.foodProductId} IS NOT NULL THEN TRUE ELSE FALSE END`,
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
    .leftJoin(
      userProductFavoritesTable,
      and(
        eq(userProductFavoritesTable.foodProductId, foodProductsTable.id),
        eq(userProductFavoritesTable.userID, id)
      )
    )
    .where(eq(imageFoodProductsTable.type, "front"))
    .limit(limit)
    .offset((page - 1) * limit);

  return products;
};

export const getProduct = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const userId = req.query.userId
    ? parseInt(req.query.userId as string)
    : undefined;
  const isScanned = req.query.scanned === "true";

  // Process images
  const foodProductDetails = await getProductData(id, userId);
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
        userScan: isScanned,
      })
      .execute();
  }
};

// TODO: Refactor this function to use Buffer instead of Express.Multer.File
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
      // (1) Food Category
      if (!frontLabelData)
        throw new Error("Front label data couldn't be processed");
      if (!frontLabelData.category) frontLabelData.category = "Uncategorized";
      const categoryId = await getCategoryIdByName(frontLabelData.category, tx);

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
          createdBy: userID,
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
        productId,
      };
    } catch (error) {
      logger.error(error);
      tx.rollback();
      return;
    }
  });
};
