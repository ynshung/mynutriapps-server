import { NutritionInfoCategory, NutritionInfoDetails, NutritionInfoFull, NutritionInfoServings } from "@/types/prompt";
import {
  nutritionInfoAvailableSchema,
  nutritionInfoCategorySchema,
  nutritionInfoDetailsSchema,
  nutritionInfoServingsSchema,
} from "./schema";
import { generateData } from "../utils/ai";
import sharp from "sharp";

export const processNutritionLabelV2 = async (
  nutritionLabelBuffer: Buffer<ArrayBufferLike>,
  model: string = "gemini-2.0-flash"
) => {
  const resizedBuffer = await sharp(nutritionLabelBuffer)
    .resize(512, 512, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();

  // TODO: Context caching
  // https://ai.google.dev/gemini-api/docs/caching?lang=node
  const nutritionLabelInfoData = await generateData<{
    extractableTable: boolean;
    perServingAvailable: boolean;
    per100gAvailable: boolean;
  }>(
    "gemini-2.0-flash-lite",
    resizedBuffer,
    "Check the availability of the nutritional table.",
    nutritionInfoAvailableSchema
  );

  // logger.info({
  //   message: "Nutrition label processed",
  //   nutrition_label_data: nutritionLabelInfoData,
  // });

  if (!nutritionLabelInfoData) {
    return {
      extractableTable: false,
    };
  }

  const extractInstruction = nutritionLabelInfoData.per100gAvailable
    ? "per 100g or ml"
    : nutritionLabelInfoData.perServingAvailable
    ? "per serving"
    : null;

  if (!nutritionLabelInfoData.extractableTable || !extractInstruction) {
    return {
      extractableTable: false,
    };
  }

  const nutritionDetailsKeys = [
    "calories",
    "fat",
    "carbs",
    "protein",
    "sugar",
    "monounsaturatedFat",
    "polyunsaturatedFat",
    "saturatedFat",
    "transFat",
    "fiber",
    "sodium",
    "cholesterol",
  ];

  const [nutritionServingsData, nutritionLabelData, nutritionLabelCategory] = await Promise.all([
    generateData<NutritionInfoServings>(
      "gemini-2.0-flash-lite",
      nutritionLabelBuffer,
      `Determine the servings size, its unit and the total servings based on the image.`,
      nutritionInfoServingsSchema
    ),
    generateData<NutritionInfoDetails>(
      model,
      nutritionLabelBuffer,
      `List the nutrition information ${extractInstruction}. If the unit stated is not the same in the picture such as kJ instead of kcal in energy, convert it accordingly. Leave blank if the value not provided in the table.`,
      nutritionInfoDetailsSchema
    ),
    generateData<NutritionInfoCategory>(
      "gemini-2.0-flash-lite",
      nutritionLabelBuffer,
      `List the vitamins and minerals listed on the nutritional label.`,
      nutritionInfoCategorySchema
    ),
  ]);
  if (nutritionServingsData && nutritionLabelData) {
    if (extractInstruction === "per serving" && nutritionServingsData.servingSize) {
      for (const key of nutritionDetailsKeys) {
        const conversionFactor = 100 / nutritionServingsData.servingSize;
        const value = nutritionLabelData[key as keyof NutritionInfoDetails];
        if (value !== undefined) {
          if (typeof value === "number") {
            (nutritionLabelData[key as keyof NutritionInfoDetails] as number) =
              parseFloat((value * conversionFactor).toFixed(2));
          }
        }
      }
    }
  }

  const finalNutritionLabelData: NutritionInfoFull = {
    extractableTable: true,
    ...nutritionServingsData,
    ...nutritionLabelData,
    ...nutritionLabelCategory,
  };

  return finalNutritionLabelData;
};
