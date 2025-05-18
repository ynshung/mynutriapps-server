import { eq } from "drizzle-orm";
import {
  foodCategoryTable,
  foodProductPublicView,
  nutritionInfoTable,
} from "../db/schema";
import { db } from "../db";
import { toFloatOrNaN } from "./type";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

enum NutriScoreProductType {
  GENERAL = "general",
  FONS = "fons", // Fats, Oils, Nuts, and Seeds
  BEVERAGE = "beverage",
  CHEESE = "cheese",
  WATER = "water",
}

const sweetenersList = [
  "E420",
  "sorbitol",
  "E421",
  "mannitol",
  "E953",
  "isomalt",
  "E956",
  "alitame",
  "E964",
  "polyglycitol syrup",
  "E965",
  "maltitol",
  "E966",
  "lactitol",
  "E967",
  "xylitol",
  "E968",
  "erythritol",
];

function calculatePoints(value: number, thresholds: number[]): number {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value > thresholds[i]) {
      return i + 1;
    }
  }
  return 0;
}

export const hardcodedFindCategory = (categoryName: string) => {
  const lowercasedCategoryName = categoryName.toLowerCase();

  if (lowercasedCategoryName.includes("drinking water")) {
    return NutriScoreProductType.WATER;
  } else if (lowercasedCategoryName.includes("cheese")) {
    return NutriScoreProductType.CHEESE;
  } else if (
    lowercasedCategoryName.includes("fats") ||
    lowercasedCategoryName.includes("oil") ||
    lowercasedCategoryName.includes("nuts") ||
    lowercasedCategoryName.includes("seeds")
  ) {
    return NutriScoreProductType.FONS;
  } else if (
    lowercasedCategoryName.includes("beverage") ||
    lowercasedCategoryName.includes("powder") ||
    lowercasedCategoryName.includes("cordial") ||
    lowercasedCategoryName.includes("drink") ||
    lowercasedCategoryName.includes("syrup") ||
    lowercasedCategoryName.includes("juice") ||
    lowercasedCategoryName.includes("soda") ||
    lowercasedCategoryName.includes("tea") ||
    lowercasedCategoryName.includes("coffee") ||
    lowercasedCategoryName.includes("milk") ||
    lowercasedCategoryName.includes("cola") ||
    lowercasedCategoryName.includes("yogurt")
  ) {
    return NutriScoreProductType.BEVERAGE;
  } else {
    return NutriScoreProductType.GENERAL;
  }
};

export const calculateNutriScoreDatabase = async (productID: number, tx: NodePgDatabase = db) => {
  const productDB = await tx
    .select()
    .from(foodProductPublicView)
    .innerJoin(
      foodCategoryTable,
      eq(foodCategoryTable.id, foodProductPublicView.foodCategoryId)
    )
    .innerJoin(
      nutritionInfoTable,
      eq(nutritionInfoTable.foodProductId, foodProductPublicView.id)
    )
    .where(eq(foodProductPublicView.id, productID));

  const product = productDB[0];

  if (!product) {
    console.warn(`Product with ID ${productID} not found.`);
    return;
  }

  const nutriScore = calculateNutriScore({
    type: hardcodedFindCategory(product.food_category.name),
    energy: toFloatOrNaN(product.nutrition_info.calories) * 4.184,
    saturatedFat: toFloatOrNaN(product.nutrition_info.saturatedFat),
    sugar: toFloatOrNaN(product.nutrition_info.sugar),
    salt: toFloatOrNaN(product.nutrition_info.sodium) / 1000,
    protein: toFloatOrNaN(product.nutrition_info.protein),
    fiber: toFloatOrNaN(product.nutrition_info.fiber),
    fvps: 0,
    ingredients: product.food_product_public_view.ingredients ?? "",
  });

  await db.update(nutritionInfoTable).set({
    nutriscore: nutriScore ?? null,
  }).where(eq(nutritionInfoTable.foodProductId, productID));

  return nutriScore;
};

export const calculateNutriScore = ({
  type,
  energy,
  saturatedFat,
  sugar,
  salt,
  protein,
  fiber,
  fvps,
  ingredients = "",
}: {
  type: NutriScoreProductType;
  energy: number; // in kJ
  saturatedFat: number; // in g
  sugar: number; // in g
  salt: number; // in g
  protein: number; // in g
  fiber: number; // in g
  fvps: number; // in g
  ingredients: string;
}) => {
  let totalScore = 0;
  if (type === NutriScoreProductType.WATER) {
    return "A";
  }

  if (isNaN(energy) || isNaN(saturatedFat)) {
    return undefined;
  }

  if (
    type === NutriScoreProductType.GENERAL ||
    type === NutriScoreProductType.CHEESE
  ) {
    const calculatePoints = (value: number, thresholds: number[]) => {
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (value > thresholds[i]) {
          return i + 1;
        }
      }
      return 0;
    };

    const energyThresholds = [
      335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350,
    ];
    const satFatThresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sugarThresholds = [
      3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51,
    ];
    const saltThresholds = [
      0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3,
    ];

    const proteinThresholds = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
    const fiberThresholds = [3.0, 4.1, 5.2, 6.3, 7.4];

    // Unfavourable components
    const energyPoints = calculatePoints(energy, energyThresholds);
    const satFatPoints = calculatePoints(saturatedFat, satFatThresholds);
    const sugarPoints = calculatePoints(sugar, sugarThresholds);
    const saltPoints = calculatePoints(salt, saltThresholds);
    const nPoints = energyPoints + satFatPoints + sugarPoints + saltPoints;

    // Favourable components
    const proteinPoints = calculatePoints(protein, proteinThresholds);
    const fiberPoints = calculatePoints(fiber, fiberThresholds);
    const fvpsPoints = fvps > 80 ? 5 : fvps > 60 ? 2 : fvps > 40 ? 1 : 0;
    const pPoints = proteinPoints + fiberPoints + fvpsPoints;

    if (nPoints < 11 || type === NutriScoreProductType.CHEESE) {
      totalScore = nPoints - fiberPoints - fvpsPoints;
    } else {
      totalScore = nPoints - pPoints;
    }

    if (totalScore <= 0) {
      return "A";
    } else if (totalScore <= 2) {
      return "B";
    } else if (totalScore <= 10) {
      return "C";
    } else if (totalScore <= 18) {
      return "D";
    } else {
      return "E";
    }
  } else if (type === NutriScoreProductType.FONS) {
    const satFatEnergy = saturatedFat * 37.66;
    const satFatEnergyThresholds = [
      120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200,
    ];
    const sugarThresholds = [
      3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51,
    ];
    const satFatThresholds = [10, 16, 22, 28, 34, 40, 46, 52, 58, 64]; // lower is better
    const saltThresholds = [
      0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3,
    ];

    const proteinThresholds = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
    const fiberThresholds = [3.0, 4.1, 5.2, 6.3, 7.4];

    // Unfavourable
    const satFatEnergyPoints = calculatePoints(
      satFatEnergy,
      satFatEnergyThresholds
    );
    const sugarPoints = calculatePoints(sugar, sugarThresholds);
    const satFatPoints = calculatePoints(saturatedFat, satFatThresholds);
    const saltPoints = calculatePoints(salt, saltThresholds);
    const nPoints =
      satFatEnergyPoints + sugarPoints + satFatPoints + saltPoints;

    // Favourable
    const proteinPoints = calculatePoints(protein, proteinThresholds);
    const fiberPoints = calculatePoints(fiber, fiberThresholds);
    const fvpsPoints = fvps > 80 ? 5 : fvps > 60 ? 2 : fvps > 40 ? 1 : 0;
    const pPoints = proteinPoints + fiberPoints + fvpsPoints;

    if (nPoints >= 7) {
      totalScore = nPoints - fiberPoints - fvpsPoints;
    } else {
      totalScore = nPoints - pPoints;
    }

    if (totalScore <= -6) {
      return "A";
    } else if (totalScore <= 2) {
      return "B";
    } else if (totalScore <= 10) {
      return "C";
    } else if (totalScore <= 18) {
      return "D";
    } else {
      return "E";
    }
  } else if (type === NutriScoreProductType.BEVERAGE) {
    const energyThresholdsNegative = [
      335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350,
    ];
    const satFatThresholdsNegative = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sugarThresholdsNegative = [
      4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45,
    ];
    const saltThresholdsNegative = [
      0.09, 0.18, 0.27, 0.36, 0.45, 0.54, 0.63, 0.72, 0.81, 0.9,
    ];

    const fiberThresholdsPositive = [0.7, 1.4, 2.1, 2.8, 3.5];
    const proteinThresholdsPositive = [1.6, 3.2, 4.8, 6.4, 8.0];

    // Unfavourable components (Negative points)
    const energyPointsNegative = calculatePoints(
      energy,
      energyThresholdsNegative
    );
    const satFatPointsNegative = calculatePoints(
      saturatedFat,
      satFatThresholdsNegative
    );
    const sugarPointsNegative = calculatePoints(sugar, sugarThresholdsNegative);
    const saltPointsNegative = calculatePoints(salt, saltThresholdsNegative);
    const sweetenerPoints = sweetenersList.some((sweetener) =>
      ingredients.toLowerCase().includes(sweetener.toLowerCase())
    )
      ? 4
      : 0;
    const nPoints =
      energyPointsNegative +
      satFatPointsNegative +
      sugarPointsNegative +
      saltPointsNegative +
      sweetenerPoints;

    // Favourable components (Positive points)
    const fiberPointsPositive = calculatePoints(fiber, fiberThresholdsPositive);
    const proteinPointsPositive = calculatePoints(
      protein,
      proteinThresholdsPositive
    );
    const fvpsPointsPositive =
      fvps >= 80 ? 5 : fvps >= 60 ? 2 : fvps >= 40 ? 1 : 0;
    const pPoints =
      fiberPointsPositive + proteinPointsPositive + fvpsPointsPositive;

    totalScore = nPoints - pPoints;

    if (totalScore <= 2) {
      return "B";
    } else if (totalScore <= 6) {
      return "C";
    } else if (totalScore <= 9) {
      return "D";
    } else {
      return "E";
    }
  } else {
    console.log("Unknown product type:", type);
    return undefined;
  }
};
