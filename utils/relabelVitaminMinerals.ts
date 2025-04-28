import { processFrontLabel } from "@/src/ai/productFrontLabel";
import { processIngredientsLabel } from "@/src/ai/productIngredients";
import { processNutritionLabelV2 } from "@/src/ai/productNutritionLabel";
import { db } from "@/src/db";
import {
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  nutritionInfoTable,
} from "@/src/db/schema";
import { generateData } from "@/src/utils/ai";
import { getCategoryIdByName } from "@/src/utils/category";
import { logger } from "@/src/utils/logger";
import { toArray, toStrOrNull, toValidStringArrayOrNull } from "@/src/utils/type";
import { Schema, Type } from "@google/genai";
import { asc, eq } from "drizzle-orm";

const START_ID = 0;
const AI_MODEL = "gemini-2.0-flash-lite";

const RELABEL = [false, false, false, true]; // [front, nutrition, ingredients, ONLY vitamins and minerals]

const relabelAll = async () => {
  const categoryItems = await db
    .select({
      id: foodProductsTable.id,
      imageKey: imagesTable.imageKey,
      imageType: imageFoodProductsTable.type,
    })
    .from(foodProductsTable)
    .innerJoin(
      imageFoodProductsTable,
      eq(foodProductsTable.id, imageFoodProductsTable.foodProductId)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .orderBy(asc(foodProductsTable.id));

  const groupedCategoryItems = categoryItems.reduce((acc, item) => {
    if (!acc[item.id]) {
      acc[item.id] = {};
    }
    acc[item.id][item.imageType] = item.imageKey;
    return acc;
  }, {} as Record<number, Record<string, string>>);

  for (const [id, item] of Object.entries(groupedCategoryItems)) {
    if (Number(id) < START_ID) continue;
    logger.info(`Processing product ID: ${id}`);
    await Promise.all(Object.entries(item).map(async ([imageType, imageKey]) => {
      try {
        const image = await fetch(
          `https://mna-sg.s3.ap-southeast-1.amazonaws.com/${imageKey}`
        );

        if (!image.ok) {
          logger.error(`Failed to fetch image for key: ${imageKey}`);
          return;
        }

        const imageArrayBuffer = await image.arrayBuffer();

        if (!imageArrayBuffer.byteLength) {
          logger.error(`Image is empty for key: ${imageKey}`);
          return;
        }

        const imageBuffer = Buffer.from(imageArrayBuffer);

        if (imageType === "front" && RELABEL[0]) {
          const frontLabelData = await processFrontLabel(imageBuffer, AI_MODEL);
          if (!frontLabelData) {
            logger.error(
              `Front label data couldn't be processed for product ID: ${id}, image: ${imageKey}`
            );
            return;
          }

          await db.update(foodProductsTable)
            .set({
              name: frontLabelData.name,
              brand: frontLabelData.brand,
              foodCategoryId: await getCategoryIdByName(frontLabelData.category)
            })
            .where(eq(foodProductsTable.id, Number(id)));

        } else if (imageType === "nutritional_table" && RELABEL[1]) {
          const nutritionLabelData = await processNutritionLabelV2(imageBuffer);
          if (!nutritionLabelData) {
            logger.error(
              `Nutrition label data couldn't be processed for product ID: ${id}, image: ${imageKey}`
            );
            return;
          }

          await db.update(nutritionInfoTable)
            .set({
              servingSize: toStrOrNull(nutritionLabelData.servingSize),
              servingSizeUnit: nutritionLabelData.servingSizeUnit,
              servingSizePerUnit: toStrOrNull(nutritionLabelData.servingSizePerUnit),
              calories: toStrOrNull(nutritionLabelData.calories),
              fat: toStrOrNull(nutritionLabelData.fat),
              carbs: toStrOrNull(nutritionLabelData.carbs),
              protein: toStrOrNull(nutritionLabelData.protein),
              sugar: toStrOrNull(nutritionLabelData.sugar),
              monounsaturatedFat: toStrOrNull(nutritionLabelData.monounsaturatedFat),
              polyunsaturatedFat: toStrOrNull(nutritionLabelData.polyunsaturatedFat),
              saturatedFat: toStrOrNull(nutritionLabelData.saturatedFat),
              transFat: toStrOrNull(nutritionLabelData.transFat),
              cholesterol: toStrOrNull(nutritionLabelData.cholesterol),
              sodium: toStrOrNull(nutritionLabelData.sodium),
              fiber: toStrOrNull(nutritionLabelData.fiber),
              vitamins: toValidStringArrayOrNull(nutritionLabelData.vitamins),
              minerals: toValidStringArrayOrNull(nutritionLabelData.minerals),
              uncategorized: toValidStringArrayOrNull(nutritionLabelData.uncategorized),
            })
            .where(eq(nutritionInfoTable.id, Number(id)));

        } else if (imageType === "ingredients" && RELABEL[2]) {
          const ingredientsLabelData = await processIngredientsLabel(imageBuffer);
          if (!ingredientsLabelData) {
            logger.error(
              `Ingredients label data couldn't be processed for product ID: ${id}, image: ${imageKey}`
            );
            return;
          }
          
          await db.update(foodProductsTable)
            .set({
              ingredients: ingredientsLabelData.ingredients,
              allergens: toArray(ingredientsLabelData.allergens),
              additives: toArray(ingredientsLabelData.additives),
            })
            .where(eq(foodProductsTable.id, Number(id)));
        } else if (imageType === "nutritional_table" && RELABEL[3]) {
          const vitaminSchema: Schema = {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: [
                "a",
                "b1",
                "b2",
                "b3",
                "b5",
                "b6",
                "b7",
                "b9",
                "b12",
                "c",
                "d",
                "e",
                "k",
              ],
            },
          }

          const vitaminData = await generateData<{ vitamins: string[] }>(
            AI_MODEL,
            imageBuffer,
            `List the vitamins that are on the nutritional table.`,
            vitaminSchema,
          );

          if (vitaminData) {
            await db.update(nutritionInfoTable)
              .set({
                vitamins: toValidStringArrayOrNull(vitaminData.vitamins),
              })
              .where(eq(nutritionInfoTable.id, Number(id)));
          }

          const mineralSchema: Schema = {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: [
                "calcium",
                "chloride",
                "chromium",
                "copper",
                "fluoride",
                "iodine",
                "iron",
                "magnesium",
                "manganese",
                "molybdenum",
                "phosphorus",
                "potassium",
                "selenium",
                "zinc",
              ],
            },
          }

          const mineralData = await generateData<{ minerals: string[] }>(
            AI_MODEL,
            imageBuffer,
            `List the minerals that are on the nutritional table.`,
            mineralSchema,
          );
          if (mineralData) {
            await db.update(nutritionInfoTable)
              .set({
                minerals: toValidStringArrayOrNull(mineralData.minerals),
              })
              .where(eq(nutritionInfoTable.id, Number(id)));
          }
        }

      } catch (error) {
        logger.error(
          `Error fetching or processing image for key: ${imageKey}`,
          error
        );
        return;
      }
    }));

    // await new Promise((resolve) => setTimeout(resolve, 8000));
  }
};

relabelAll();
