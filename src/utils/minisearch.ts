import { ProductSearchResult } from "@/types";
import { db } from "../db";
import { foodCategoryTable, foodProductsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import MiniSearch from "minisearch";

const getProductMS = async (): Promise<ProductSearchResult[]> => {
  const data = await db
    .select({
      id: foodProductsTable.id,
      name: foodProductsTable.name,
      brand: foodProductsTable.brand,
      category: foodCategoryTable.name,
      verified: foodProductsTable.verified,
    })
    .from(foodProductsTable)
    .innerJoin(
      foodCategoryTable,
      eq(foodProductsTable.foodCategoryId, foodCategoryTable.id)
    );

  return data;
};

export const searchProductsMS = async (query: string) => {
  const miniSearch = new MiniSearch({
    fields: ["name", "brand"],
    storeFields: ["id", "name", "brand", "category", "verified"],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
    }
  });

  const data = await getProductMS();
  miniSearch.addAll(data);
  return miniSearch.search(query);
};

export const searchSuggestionsMS = async (query: string) => {
  const miniSearch = new MiniSearch({
    fields: ["name", "brand"],
    storeFields: ["id", "name", "brand", "category", "verified"],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
    }
  });

  const data = await getProductMS();
  miniSearch.addAll(data);
  return miniSearch.search(query);
};
