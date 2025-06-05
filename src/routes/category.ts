import { aliasedTable, count, desc, eq, getTableColumns, notExists } from "drizzle-orm";
import { foodCategoryTable, foodProductPublicView, imagesTable } from "../db/schema";
import { db } from "../../src/db";
import { ProductCardType } from "@/types";
import { productsQuery } from "./product";

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
      foodProductCount: count(foodProductPublicView.id), // counting product IDs
      // TODO: is this used?
    })
    .from(foodCategoryTable)
    .leftJoin(
      foodProductPublicView,
      eq(foodProductPublicView.foodCategoryId, foodCategoryTable.id)
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

/**
 * @deprecated Use `listProducts` instead
 */
export const listProductsCategory = async (categoryID: number, userID?: number, page = 1, limit = 10) => {
  const data: ProductCardType[] = await productsQuery({ userID }).where(
    eq(foodProductPublicView.foodCategoryId, categoryID)
  )
    .orderBy(desc(foodProductPublicView.createdAt))
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit));

  return data;
};
