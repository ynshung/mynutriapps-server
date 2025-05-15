import { db } from "@/src/db";
import { foodProductsTable, nutritionInfoTable } from "@/src/db/schema";
import { NutritionInfoDB } from "@/types";
import { and, eq, getTableColumns } from "drizzle-orm";

export const NUTRITION_FACT_KEYS: (keyof NutritionInfoDB)[] = [
  "calories",
  "fat",
  "protein",
  "carbs",
  "sugar",
  "fiber",
  "sodium",
  "cholesterol",
  "monounsaturatedFat",
  "polyunsaturatedFat",
  "saturatedFat",
  "transFat",
];

export type NutritionFactKey = (typeof NUTRITION_FACT_KEYS)[number];

// Quartiles for each nutrition fact key
export const evaluateNutritionQuartiles: (
  categoryID: number,
  quartile?: number,
) => Promise<
  {
    id: number;
    quartiles: Record<keyof NutritionInfoDB | "additives", number>;
  }[]
> = async (categoryID: number, quartile = 3) => {
  const data = await db
    .select({
      id: foodProductsTable.id,
      nutrition_info: getTableColumns(nutritionInfoTable),
      food_products: {
        ingredients: foodProductsTable.ingredients,
        additives: foodProductsTable.additives,
      },
    })
    .from(nutritionInfoTable)
    .innerJoin(
      foodProductsTable,
      eq(nutritionInfoTable.foodProductId, foodProductsTable.id)
    )
    .where(and(eq(foodProductsTable.foodCategoryId, categoryID)));

  const result = data.map((item) => {
    const quartiles: Record<string, number> = {};

    NUTRITION_FACT_KEYS.forEach((key) => {
      const itemsWithKey = data
        .filter((i) => i.nutrition_info[key] !== null)
        .map((i) => ({
          ...i,
          value: Number(i.nutrition_info[key]),
        }));

      if (itemsWithKey.length < quartile * 2) {
        quartiles[key] = 0;
        return;
      }

      const sortedItems = itemsWithKey.sort((a, b) => a.value - b.value);
      const quartileSize = Math.ceil(sortedItems.length / quartile);

      const itemIndex = sortedItems.findIndex(
        (sortedItem) => sortedItem.id === item.id
      );

      if (itemIndex !== -1) {
        for (let q = 1; q <= quartile; q++) {
          if ((key === "transFat" || key === 'cholesterol') && sortedItems[itemIndex].value < 0.01) {
            quartiles[key] = 1;
          } else if (itemIndex < quartileSize * q) {
            quartiles[key] = q;
            break;
          }
        }
      }
    });

    const additivesItems = data
      .filter((i) => {
        return i.food_products.ingredients?.trim() !== "";
      })
      .map((i) => ({
        ...i,
        additivesLength: i.food_products.additives?.length ?? 0,
      }));

    if (additivesItems.length < quartile * 2) {
      quartiles["additives"] = 0;
    } else {
      const sortedAdditivesItems = additivesItems.sort(
        (a, b) => a.additivesLength - b.additivesLength
      );
      const additivesQuartileSize = Math.ceil(sortedAdditivesItems.length / quartile);

      const additivesItemIndex = sortedAdditivesItems.findIndex(
        (sortedItem) => sortedItem.id === item.id
      );

      if (additivesItemIndex !== -1) {
        for (let q = 1; q <= quartile; q++) {
          if (additivesItemIndex < additivesQuartileSize * q) {
            quartiles["additives"] = q;
            break;
          }
        }
      }
    }

    return {
      id: item.id,
      quartiles,
    };
  });

  return result;
};
