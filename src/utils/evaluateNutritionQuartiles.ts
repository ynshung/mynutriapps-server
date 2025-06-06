import { db } from "@/src/db";
import { foodProductPublicView, nutritionInfoTable } from "@/src/db/schema";
import { NutritionInfoDB } from "@/types";
import { eq, getTableColumns } from "drizzle-orm";

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
  quartile?: number
) => Promise<
  {
    id: number;
    quartiles: Record<keyof NutritionInfoDB | "additives", number>;
    ranking: Record<keyof NutritionInfoDB | "additives", number>;
  }[]
> = async (categoryID: number, quartile = 3) => {
  const data = await db
    .select({
      id: foodProductPublicView.id,
      nutrition_info: getTableColumns(nutritionInfoTable),
      food_products: {
        ingredients: foodProductPublicView.ingredients,
        additives: foodProductPublicView.additives,
      },
    })
    .from(nutritionInfoTable)
    .innerJoin(
      foodProductPublicView,
      eq(nutritionInfoTable.foodProductId, foodProductPublicView.id)
    )
    .where(eq(foodProductPublicView.foodCategoryId, categoryID));

  const result = data.map((item) => {
    const quartiles: Record<string, number> = {};
    const ranking: Record<string, number> = {};

    NUTRITION_FACT_KEYS.forEach((key) => {
      const itemsWithKey = data
        .filter((i) => i.nutrition_info[key] !== null)
        .map((i) => ({
          ...i,
          value: Number(i.nutrition_info[key]),
        }));

      const sortedItems = itemsWithKey.sort((a, b) => a.value - b.value);

      const valueSet = new Set(sortedItems.map((i) => i.value));
      const valueIndex = Array.from(valueSet).indexOf(
        Number(item.nutrition_info[key] ?? "NaN")
      );
      if (
        !isNaN(valueIndex) &&
        !isNaN(Number(item.nutrition_info[key])) &&
        valueIndex !== -1
      ) {
        ranking[key] = valueIndex / (valueSet.size - 1);
      }

      const quartileSize = Math.ceil(sortedItems.length / quartile);
      const itemIndex = sortedItems.findIndex(
        (sortedItem) => sortedItem.id === item.id
      );

      if (itemIndex !== -1) {
        if (itemsWithKey.length < quartile * 2) {
          quartiles[key] = 0;
          return;
        }
        for (let q = 1; q <= quartile; q++) {
          if (
            (key === "transFat" || key === "cholesterol") &&
            sortedItems[itemIndex].value < 0.01
          ) {
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

    const sortedAdditivesItems = additivesItems.sort(
      (a, b) => a.additivesLength - b.additivesLength
    );

    const additivesLengthSet = new Set(
      sortedAdditivesItems.map((i) =>
        i.food_products.ingredients !== null ? i.additivesLength : undefined
      )
    );
    additivesLengthSet.delete(undefined);

    if (item.food_products.additives?.length) {
      ranking["additives"] =
        Array.from(additivesLengthSet).indexOf(
          item.food_products.additives.length
        ) /
        (additivesLengthSet.size - 1);
    }

    const additivesQuartileSize = Math.ceil(
      sortedAdditivesItems.length / quartile
    );

    const additivesItemIndex = sortedAdditivesItems.findIndex(
      (sortedItem) => sortedItem.id === item.id
    );

    if (additivesItemIndex !== -1) {
      if (additivesItems.length < quartile * 2) {
        quartiles["additives"] = 0;
      } else {
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
      ranking,
    };
  });

  return result;
};
