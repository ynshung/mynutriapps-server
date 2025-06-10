import { Request, Response } from "express";
import { db } from "@src/db";
import { and, arrayOverlaps, desc, eq, getTableColumns, gt, inArray, isNotNull, sql, SQLWrapper } from "drizzle-orm";
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
  foodProductPublicView,
  userReportTable,
  GoalType,
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
import { setCategoryProductScore } from "../utils/recommendation";
import { getSortKey, withPagination, withSort } from "../utils/filter";

// TODO: Generalize the functions in this file, whether to use req, res directly or not

export const productsQuery = ({
  userID,
  additionalGroupBy = [],
  additionalFields = {},
  table = foodProductPublicView,
}: {
  userID?: number;
  additionalGroupBy?: PgColumn[];
  additionalFields?: SelectedFields;
  table?: typeof foodProductPublicView | typeof foodProductsTable;
}) => {
  return db
    .select({
      id: table.id,
      barcode: table.barcode,
      name: sql<string>`${table.name}`.as("product_name"),
      brand: table.brand,
      category: sql<string>`${foodCategoryTable.name}`.as("category_name"),
      images: sql<
        Record<string, string>
      >`json_object_agg(${imageFoodProductsTable.type}, ${imagesTable.imageKey})`.as(
        "images"
      ),
      verified: table.verified,
      createdAt: table.createdAt,
      favorite:
        sql<boolean>`CASE WHEN ${userProductFavoritesTable.foodProductId} IS NOT NULL THEN TRUE ELSE FALSE END`.as(
          "favorite"
        ),
      quartile: sql<ProductScore | null>`(${table.score} -> ${
        usersTable.goal ?? "improveHealth"
      }::text)`,
      allergens:
        sql<boolean>`CASE WHEN ${usersTable.allergies} IS NOT NULL AND ${usersTable.allergies} && ${table.allergens} THEN TRUE ELSE FALSE END`.as(
          "allergens"
        ),
      hidden: table.hidden,
      ...additionalFields,
    })
    .from(table)
    .innerJoin(
      imageFoodProductsTable,
      eq(imageFoodProductsTable.foodProductId, table.id)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .innerJoin(
      foodCategoryTable,
      eq(table.foodCategoryId, foodCategoryTable.id)
    )
    .leftJoin(
      userProductFavoritesTable,
      and(
        eq(userProductFavoritesTable.foodProductId, table.id),
        userID ? eq(userProductFavoritesTable.userID, userID) : sql`TRUE`
      )
    )
    .leftJoin(usersTable, eq(usersTable.id, userID ?? -1))
    .groupBy(
      table.id,
      table.name,
      table.barcode,
      table.brand,
      table.verified,
      table.createdAt,
      table.score,
      table.allergens,
      userProductFavoritesTable.foodProductId,
      foodCategoryTable.name,
      usersTable.goal,
      usersTable.allergies,
      table.hidden,
      ...additionalGroupBy
    );
};

export const listProducts = async ({
  userID,
  userGoal,
  page = 1,
  limit = 10,
  sort = "CREATED_AT_DESC",
  categoryId,
  scoreFilter = false,
}: {
  userID?: number;
  userGoal?: GoalType;
  page?: number;
  limit?: number;
  sort?: string;
  categoryId?: number;
  scoreFilter?: boolean;
}) => {
  const data = productsQuery({
    userID,
  })
    .$dynamic();
  
  const filters: SQLWrapper[] = []

  if (categoryId !== undefined) {
    filters.push(eq(foodProductPublicView.foodCategoryId, categoryId));
  }
  if (scoreFilter === true || sort === "healthiness_asc" || sort === "healthiness_desc") {
    filters.push(isNotNull(sql`${foodProductPublicView.score}->${userGoal ?? "improveHealth"}::text`));
  }
  const filteredData = data.where(and(...filters));

  const sortedData = withSort(filteredData, getSortKey(sort as string | undefined), userGoal);
  const paginatedData = withPagination(sortedData, page, limit);

  return await paginatedData;
};

export const listSubmittedProducts = async (req: Request, res: Response) => {
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;

  const data: ProductCardType[] = await productsQuery({
    userID,
    table: foodProductsTable,
  })
    .where(eq(foodProductsTable.createdBy, Number(userID)))
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
          eq(userProductClicksTable.foodProductId, foodProductPublicView.id)
        )
        .as("click_count"),
    },
  })
    .where(eq(foodProductPublicView.hidden, false))
    // @ts-expect-error: additionalFields is not typed
    .having((fields) => gt(fields.clickCount as number, 0))
    .orderBy(desc(sql`"click_count"`))
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit));

  return products;
};

export const listPopularProductsWeighted = async ({
  page,
  limit,
  userID,
  categoryId,
  userGoal,
  showAll = false,
  userOnly = false,
}: {
  page: number;
  limit: number;
  userID?: number;
  categoryId?: number;
  userGoal?: GoalType;
  showAll?: boolean;
  userOnly?: boolean;
}) => {
  const productsClick = await db
    .select(getTableColumns(userProductClicksTable))
    .from(userProductClicksTable)
    .innerJoin(
      foodProductsTable,
      eq(userProductClicksTable.foodProductId, foodProductsTable.id)
    )
    .where(
      and(
        eq(foodProductsTable.hidden, false),
        categoryId
          ? eq(foodProductsTable.foodCategoryId, categoryId)
          : sql`TRUE`,
        userGoal
          ? isNotNull(
              sql`${foodProductsTable.score}->${
                userGoal ?? "improveHealth"
              }::text`
            )
          : sql`TRUE`,
        userOnly
          ? eq(userProductClicksTable.userID, userID ?? -1)
          : sql`TRUE`
      )
    )
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
      and(
        !showAll
          ? inArray(
              foodProductPublicView.id,
              sortedProductIds.map((id) => parseInt(id))
            )
          : sql`TRUE`,
        userGoal !== undefined && showAll ? isNotNull(
          sql`${foodProductPublicView.score}->${
            userGoal ?? "improveHealth"
          }::text`
        ) : sql`TRUE`,
        eq(foodProductPublicView.hidden, false),
        categoryId
          ? eq(foodProductPublicView.foodCategoryId, categoryId)
          : sql`TRUE`
      )
    )
    .orderBy(
      sql`ARRAY_POSITION(ARRAY[${sql.join(
        sortedProductIds,
        sql`, `
      )}]::INTEGER[], ${foodProductPublicView.id})`
    )
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit));

  return popularProducts;
};

export const searchBarcode = async (req: Request, res: Response) => {
  const barcode = req.query.q as string;
  const { userID } = req;

  const data = await productsQuery({
    userID,
  })
    .orderBy(desc(foodProductPublicView.createdAt))
    .where(
      and(
        arrayOverlaps(foodProductPublicView.barcode, [barcode]),
        eq(foodProductPublicView.hidden, false)
      )
    )
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
    .where(
      and(
        eq(userProductClicksTable.userID, id),
      )
    )
    .orderBy(
      desc(userProductClicksTable.foodProductId),
      desc(userProductClicksTable.clickedAt)
    )
    .as("user");

  const products: ProductCardType[] = await productsQuery({
    userID: id,
    additionalGroupBy: [subquery.clickedAt],
  })
    .innerJoin(subquery, eq(subquery.foodProductId, foodProductPublicView.id))
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
  const isCompare = req.query.compare === "true";

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

  if (userId && !isCompare) {
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
  },
  existingID?: string
) => {
  const oldProduct = parseInt(existingID ?? "");
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
        createdBy: userID,
        hidden: !isNaN(oldProduct) ? true : false,
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
        await createNewProductNutrition(
          productId,
          nutritionLabelData,
          tx,
          categoryId ? frontLabelData.category : undefined,
          ingredientsData?.ingredients
        );
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

      // (5) Existing Product Report
      if (!isNaN(oldProduct)) {
        await tx.insert(userReportTable).values({
          userID: userID,
          foodProductId: productId,
          oldFoodProductId: oldProduct,
          reportType: ["resubmission"],
        });
      }

      if (isNaN(oldProduct)) await setCategoryProductScore(categoryId, tx);

      return {
        status: "success",
        productId,
      };
    } catch (error) {
      logger.error(error);
      console.error(error);
      tx.rollback();
      return;
    }
  });
};
