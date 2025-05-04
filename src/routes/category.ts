import { aliasedTable, and, count, desc, eq, getTableColumns, notExists, sql } from "drizzle-orm";
import { foodCategoryTable, foodProductsTable, imageFoodProductsTable, imagesTable, userProductFavoritesTable } from "../db/schema";
import { db } from "../../src/db";
import { ProductCardType } from "@/types";

export interface CategoryList {
  id: number;
  name: string;
  parentCategory: number | null;
  children: {
    id: number;
    name: string;
    parentCategory: number | null;
    foodProductCount: number;
    image: string | null;
  }[];
  foodProductCount: number;
  image: string | null;
}

// This function is related to web getCategoriesParent
export const listCategory = async () => {
  const query = await db
    .select({
      ...getTableColumns(foodCategoryTable),
      imageKey: imagesTable.imageKey,
      foodProductCount: count(foodProductsTable.id), // counting product IDs
    })
    .from(foodCategoryTable)
    .leftJoin(
      foodProductsTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    )
    .leftJoin(imagesTable, eq(foodCategoryTable.image, imagesTable.id))
    .groupBy(foodCategoryTable.id, imagesTable.imageKey)
    .orderBy(foodCategoryTable.sequence, foodCategoryTable.id);

  const typedQuery = query as (typeof foodCategoryTable.$inferSelect & {
    imageKey: string | null;
    foodProductCount: number;
  })[];

  const mainCategories = typedQuery.filter((category) => category.parentCategory === null);

  // Aggregate main categories and their children
  const aggregated = mainCategories.map((mainCategory) => {
    const children = typedQuery
      .filter((category) => category.parentCategory === mainCategory.id);

    return {
      ...mainCategory,
      children,
    };
  });

  return aggregated;
};

export const listCategoryChildren = async () => {
  const foodCategoryChildren = aliasedTable(
    foodCategoryTable,
    "foodCategoryChildren"
  );
  const subquery = db
    .select({ id: foodCategoryChildren.id })
    .from(foodCategoryChildren)
    .where(eq(foodCategoryChildren.parentCategory, foodCategoryTable.id));

  const categories = await db
    .select({
      id: foodCategoryTable.id,
      name: foodCategoryTable.name,
    })
    .from(foodCategoryTable)
    .where(notExists(subquery))
    .orderBy(foodCategoryTable.id);

  return categories.reduce((acc, category) => {
    acc[category.id] = category.name;
    return acc;
  }, {} as Record<number, string>);
};

export const getCategoryDetails = async (categoryID: number) => {
  const parentCategory = aliasedTable(foodCategoryTable, "parentCategory");
  const category = await db
    .select({
      ...getTableColumns(foodCategoryTable),
      parentCategory: parentCategory.name,
    })
    .from(foodCategoryTable)
    .where(eq(foodCategoryTable.id, categoryID))
    .leftJoin(
      parentCategory,
      eq(parentCategory.id, foodCategoryTable.parentCategory)
    )
    .limit(1);
  if (category.length === 0) {
    return null;
  }
  const categoryDetails = category[0];
  return categoryDetails;
}

export const listProductsCategory = async (categoryID: number, userID?: number, page = 1, limit = 10) => {
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
    .where(and(eq(foodProductsTable.foodCategoryId, categoryID), eq(imageFoodProductsTable.type, "front")))
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

  return data;
};
