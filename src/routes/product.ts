import { Request, Response } from "express";
import { db } from "@src/db";
import { and, arrayOverlaps, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  foodCategoryTable,
  userProductClicksTable,
  userProductFavoritesTable,
  userSearchHistoryTable,
  usersTable,
  ProductScore,
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
import { PgColumn, SelectedFields } from "drizzle-orm/pg-core";

// TODO: Generalize the functions in this file, whether to use req, res directly or not

export const productsQuery = ({
  userID,
  additionalGroupBy = [],
  additionalFields = {},
}: {
  userID?: number;
  additionalGroupBy?: PgColumn[];
  additionalFields?: SelectedFields;
}) => {
  return db
    .select({
      id: foodProductsTable.id,
      barcode: foodProductsTable.barcode,
      name: sql<string>`${foodProductsTable.name}`.as("product_name"),
      brand: foodProductsTable.brand,
      category: sql<string>`${foodCategoryTable.name}`.as("category_name"),
      images: sql<
        Record<string, string>
      >`json_object_agg(${imageFoodProductsTable.type}, ${imagesTable.imageKey})`.as(
        "images"
      ),
      verified: foodProductsTable.verified,
      createdAt: foodProductsTable.createdAt,
      favorite:
        sql<boolean>`CASE WHEN ${userProductFavoritesTable.foodProductId} IS NOT NULL THEN TRUE ELSE FALSE END`.as(
          "favorite"
        ),
      quartile: sql<ProductScore | null>`(${foodProductsTable.score} -> ${
        usersTable.goal ?? "improveHealth"
      }::text)`,
      allergens:
        sql<boolean>`CASE WHEN ${usersTable.allergies} IS NOT NULL AND ${usersTable.allergies} && ${foodProductsTable.allergens} THEN TRUE ELSE FALSE END`.as(
          "allergens"
        ),
      ...additionalFields,
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
    .leftJoin(
      userProductFavoritesTable,
      and(
        eq(userProductFavoritesTable.foodProductId, foodProductsTable.id),
        userID ? eq(userProductFavoritesTable.userID, userID) : sql`TRUE`
      )
    )
    .leftJoin(usersTable, eq(usersTable.id, userID ?? -1))
    .groupBy(
      foodProductsTable.id,
      foodProductsTable.name,
      foodProductsTable.barcode,
      foodProductsTable.brand,
      foodCategoryTable.name,
      foodProductsTable.verified,
      foodProductsTable.createdAt,
      userProductFavoritesTable.foodProductId,
      usersTable.goal,
      usersTable.allergies,
      ...additionalGroupBy
    );
};

export const listProducts = async (req: Request, res: Response) => {
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;

  const data: ProductCardType[] = await productsQuery({
    userID,
  })
    .orderBy(desc(foodProductsTable.createdAt))
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit));

  res.json(data);
};

/**
 * @deprecated
 */
export const listPopularProducts = async (
  page: number,
  limit: number,
  userID?: number
) => {
  const products = await productsQuery({
    userID,
    additionalFields: {
      clickCount: db
        .$count(
          userProductClicksTable,
          eq(userProductClicksTable.foodProductId, foodProductsTable.id)
        )
        .as("click_count"),
    },
  })
    // @ts-expect-error: additionalFields is not typed
    .having((fields) => gt(fields.clickCount as number, 0))
    .orderBy(desc(sql`"click_count"`))
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit));

  return products;
};

export const listPopularProductsWeighted = async (
  page: number,
  limit: number,
  userID?: number
) => {
  const productsClick = await db
    .select()
    .from(userProductClicksTable)
    .limit(5120);

  const times = productsClick.map(({ clickedAt }) => clickedAt.getTime());
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  const DECAY_RATE = 100;

  const scores: Record<string, number> = {};
  const clickCounts: Record<string, number> = {};

  for (const { foodProductId, clickedAt } of productsClick) {
    const age = maxTime - clickedAt.getTime();
    const weight = Math.exp((-DECAY_RATE * age) / (maxTime - minTime)); // normalized decay

    scores[foodProductId] = (scores[foodProductId] || 0) + weight;
    clickCounts[foodProductId] = (clickCounts[foodProductId] || 0) + 1;
  }

  const sortedProductIds = Object.entries(scores)
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .slice((page - 1) * limit, page * limit)
    .map(([productId]) => productId);

  const popularProducts = await productsQuery({
    userID,
  })
    .where(
      inArray(
        foodProductsTable.id,
        sortedProductIds.map((id) => parseInt(id))
      )
    )
    .orderBy(
      sql`ARRAY_POSITION(ARRAY[${sql.join(
        sortedProductIds,
        sql`, `
      )}]::INTEGER[], ${foodProductsTable.id})`
    );

  return popularProducts;
};

export const searchBarcode = async (req: Request, res: Response) => {
  const barcode = req.query.q as string;
  const { userID } = req;

  const data = await productsQuery({
    userID,
  })
    .orderBy(desc(foodProductsTable.createdAt))
    .where(arrayOverlaps(foodProductsTable.barcode, [barcode]))
    .limit(1);

  const product: ProductCardType | undefined =
    data.length > 0 ? data[0] : undefined;

  if (!product) {
    res.status(404).json({ message: "No product found" });
  }

  res.json(product);
};

export const searchProducts = async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const result = await searchProductsMS(query, req.userID);
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
  const favorites = productsQuery({
    userID,
    additionalGroupBy: [userProductFavoritesTable.favoritedAt],
  })
    .orderBy(desc(userProductFavoritesTable.favoritedAt))
    .where(eq(userProductFavoritesTable.userID, userID));

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

  const products: ProductCardType[] = await productsQuery({
    userID: id,
    additionalGroupBy: [subquery.clickedAt],
  })
    .innerJoin(subquery, eq(subquery.foodProductId, foodProductsTable.id))
    .orderBy(desc(subquery.clickedAt))
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
