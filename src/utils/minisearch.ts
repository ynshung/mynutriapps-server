import { ProductCardType, ProductSearchResult } from "@/types";
import { db } from "../db";
import {
  foodCategoryTable,
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
} from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import MiniSearch from "minisearch";

// TODO: Optimize constant fetching from database
const getProductMS = async (): Promise<ProductSearchResult[]> => {
  const data = await db
    .select({
      id: foodProductsTable.id,
      name: foodProductsTable.name,
      brand: foodProductsTable.brand,
    })
    .from(foodProductsTable)
    .innerJoin(
      foodCategoryTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    );

  return data;
};

export const searchProductsMS = async (
  query: string
): Promise<ProductCardType[]> => {
  const miniSearch = new MiniSearch({
    fields: ["name", "brand"],
    storeFields: ["id"],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const data = await getProductMS();
  miniSearch.addAll(data);
  const result = miniSearch.search(query);
  const idList = result.map((r) => r.id);
  const dbQuery = await db
    .select({
      id: foodProductsTable.id,
      name: sql<string>`${foodProductsTable.name}`.as("product_name"),
      barcode: foodProductsTable.barcode,
      brand: foodProductsTable.brand,
      category: sql<string>`${foodCategoryTable.name}`.as("category_name"),
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
    .where(
      and(
        inArray(foodProductsTable.id, idList),
        eq(imageFoodProductsTable.type, "front")
      )
    )
    .orderBy(sql`ARRAY_POSITION(ARRAY[${sql.join(idList, sql`, `)}]::INTEGER[], ${foodProductsTable.id})`)

  return dbQuery;
};

export const searchSuggestionsMS = async (query: string) => {
  const miniSearch = new MiniSearch({
    fields: ["name", "brand"],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const data = await getProductMS();
  miniSearch.addAll(data);
  return miniSearch.autoSuggest(query).slice(0, 5);
};
