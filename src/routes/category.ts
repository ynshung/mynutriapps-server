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

export const listCategory = async () => {
  const childCategory = aliasedTable(foodCategoryTable, "childCategory");
  const foodProductChildCategory = aliasedTable(
    foodProductsTable,
    "foodProductChildCategory"
  );
  const query = await db
    .select({
      ...getTableColumns(foodCategoryTable),
      children: {
        ...getTableColumns(childCategory),
        foodProductCount: count(foodProductChildCategory.id),
      },
      foodProductCount: count(foodProductsTable.id),
      image: imagesTable.imageKey,
    })
    .from(foodCategoryTable)
    .leftJoin(
      childCategory,
      eq(childCategory.parentCategory, foodCategoryTable.id)
    )
    .leftJoin(
      foodProductChildCategory,
      eq(foodProductChildCategory.foodCategoryId, childCategory.id)
    )
    .leftJoin(
      foodProductsTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    )
    .leftJoin(
      imagesTable,
      eq(imagesTable.id, foodCategoryTable.image)
    )
    .groupBy(foodCategoryTable.id, childCategory.id, imagesTable.id)
    .orderBy(foodCategoryTable.id);

  const typedQuery = query as (typeof foodCategoryTable.$inferSelect & {
    children:
      | (typeof foodCategoryTable.$inferSelect & {
          foodProductCount: number;
        })
      | null;
    foodProductCount: number;
  })[];

  const addedIDs = new Set<number>();
  // Sorting by parentCategory to prevent duplication
  const sortedQuery = typedQuery.sort((a, b) => {
    if (a.parentCategory === b.parentCategory) {
      return a.id - b.id;
    }
    return (a.parentCategory ?? 0) - (b.parentCategory ?? 0);
  });
  const aggregated = sortedQuery.reduce<CategoryList[]>((acc, curr) => {
    const existingParent = acc.find((item) => item.id === curr.id);

    if (existingParent && curr.children) {
      existingParent.children.push(curr.children);
      addedIDs.add(curr.id);
      addedIDs.add(curr.children.id);
    } else if (!addedIDs.has(curr.id)) {
      acc.push({
        ...curr,
        children: curr.children ? [curr.children] : [],
        foodProductCount: curr.foodProductCount,
      });
      addedIDs.add(curr.id);
      if (curr.children) {
        addedIDs.add(curr.children.id);
      }
    }
    return acc;
  }, []);

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
