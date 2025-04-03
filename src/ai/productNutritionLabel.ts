import { NutritionInfo, NutritionInfoCategory, NutritionInfoDetails, NutritionInfoFull, NutritionInfoServings } from "@/types/prompt";
import {
  nutritionInfoAvailableSchema,
  nutritionInfoCategorySchema,
  nutritionInfoDetailsSchema,
  nutritionInfoSchema,
  nutritionInfoServingsSchema,
} from "./schema";
import { bufferToGenerativePart, genAI, generateData } from "../utils/ai";
import { logger } from "../utils/logger";
import { uploadImage } from "../utils/image";
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

/**
 * @deprecated
 */
export const processNutritionLabel = async (
  nutritionLabel: Express.Multer.File,
  userID?: number,
  model: string = "gemini-2.0-flash-lite"
) => {
  let imageID = "";
  if (userID !== undefined) {
    ({ imageID } = await uploadImage(nutritionLabel, userID));
  }
  const nutritionLabelModel = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: nutritionInfoSchema,
      temperature: 0.1,
    },
  });

  const nutritionLabelResult = await nutritionLabelModel.generateContent([
    bufferToGenerativePart(nutritionLabel.buffer),
    "List the nutrition information based on the JSON structure, if the properties are not provided, leave as blank. If the predefined unit is not the same, convert it (50mg carbs to 0.05g carbs, 1.2g sodium to 1200mg sodium).",
  ]);

  console.log(nutritionLabelResult.response.text());

  const nutritionLabelData: NutritionInfo = JSON.parse(
    nutritionLabelResult.response.text()
  );

  logger.info({
    message: "Nutrition label processed",
    img_id: imageID,
    nutrition_label_data: nutritionLabelData,
  });

  return { imageID, nutritionLabelData };
};
