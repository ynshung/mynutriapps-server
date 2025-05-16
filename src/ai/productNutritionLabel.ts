import { NutritionInfoCategory, NutritionInfoDetails, NutritionInfoFull, NutritionInfoServings } from "@/types/prompt";
import {
  nutritionInfoAvailableSchema,
  nutritionInfoCategorySchema,
  nutritionInfoDetailsSchema,
  nutritionInfoServingsSchema,
} from "./schema";
import { generateData } from "../utils/ai";
import sharp from "sharp";
import { NUTRITION_FACT_KEYS } from "@/src/utils/evaluateNutritionQuartiles";

export const processNutritionLabelV2 = async (
  nutritionLabelBuffer: Buffer<ArrayBufferLike>,
  model = "gemini-2.0-flash",
  liteModel = "gemini-2.0-flash-lite",
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
    liteModel,
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

  const [nutritionServingsData, nutritionLabelData, nutritionLabelCategory] = await Promise.all([
    generateData<NutritionInfoServings>(
      liteModel,
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
      liteModel,
      nutritionLabelBuffer,
      `List the vitamins and minerals listed on the nutritional label.`,
      nutritionInfoCategorySchema
    ),
  ]);
  if (nutritionServingsData && nutritionLabelData) {
    if (extractInstruction === "per serving" && nutritionServingsData.servingSize) {
      for (const key of NUTRITION_FACT_KEYS) {
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
