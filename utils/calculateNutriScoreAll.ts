import { db } from "@/src/db";
import { nutritionInfoTable } from "@/src/db/schema";
import { calculateNutriScoreDatabase } from "@/src/utils/nutriscore";

const calculateNutriScoreAll = async () => {
  const nutritionDB = await db
    .select({ id: nutritionInfoTable.foodProductId })
    .from(nutritionInfoTable);

  nutritionDB.forEach(async (nutrition) => {
    const score = await calculateNutriScoreDatabase(nutrition.id);
    console.log(`NutriScore for ${nutrition.id} is ${score}`);
  });
};

calculateNutriScoreAll();
