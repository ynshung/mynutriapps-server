import { ProductCardType, ProductSearchResult } from "@/types";
import { db } from "../db";
import {
  foodCategoryTable,
  foodProductPublicView,
  imageFoodProductsTable,
} from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import MiniSearch from "minisearch";
import { productsQuery } from "../routes/product";

// TODO: Optimize constant fetching from database
const getProductMS = async (): Promise<ProductSearchResult[]> => {
  const data = await db
    .select({
      id: foodProductPublicView.id,
      name: foodProductPublicView.name,
      brand: foodProductPublicView.brand,
    })
    .from(foodProductPublicView)
    .innerJoin(
      foodCategoryTable,
      eq(foodProductPublicView.foodCategoryId, foodCategoryTable.id)
    );
  
  // Replace diacritics
  return data.map((item) => ({
    ...item,
    name: item.name ? item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "",
    brand: item.brand ? item.brand.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "",
  }));
};

export const searchProductsMS = async (
  query: string,
  userID?: number,
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
  const dbQuery = await productsQuery({
    userID,
  })
    .where(
      and(
        inArray(foodProductPublicView.id, idList),
        eq(imageFoodProductsTable.type, "front")
      )
    )
    .orderBy(sql`ARRAY_POSITION(ARRAY[${sql.join(idList, sql`, `)}]::INTEGER[], ${foodProductPublicView.id})`);

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
