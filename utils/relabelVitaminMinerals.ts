import { db } from "@/src/db";
import {
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
  nutritionInfoTable,
} from "@/src/db/schema";
import { generateData } from "@/src/utils/ai";
import { logger } from "@/src/utils/logger";
import { toValidStringArrayOrNull } from "@/src/utils/type";
import { Schema, Type } from "@google/genai";
import { asc, eq } from "drizzle-orm";

const START_ID = 0;
const AI_MODEL = "gemini-2.0-flash-lite";

const relabelVitaminsAndMinerals = async () => {
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
    .where(eq(imageFoodProductsTable.type, "nutritional_table"))
    .orderBy(asc(foodProductsTable.id));

  for (const { id, imageKey } of categoryItems) {
    if (Number(id) < START_ID) continue;
    logger.info(`Processing product ID: ${id}`);
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
      };

      const vitaminData = await generateData<string[]>(
        AI_MODEL,
        imageBuffer,
        `List the vitamins that are on the nutritional table. Available vitamins are: a, b1, b2, b3, b5, b6, b7, b9, b12, c, d, e and k.`,
        vitaminSchema
      );

      if (vitaminData) {
        await db
          .update(nutritionInfoTable)
          .set({
            vitamins: toValidStringArrayOrNull(vitaminData),
          })
          .where(eq(nutritionInfoTable.foodProductId, Number(id)));
      }

      const mineralSchema: Schema = {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
        },
      };

      const mineralData = await generateData<string[]>(
        AI_MODEL,
        imageBuffer,
        `List the minerals that are on the nutritional table. Available minerals are: calcium, chloride, chromium, copper, fluoride, iodine, iron, magnesium, manganese, molybdenum, phosphorus, potassium, selenium and zinc.`,
        mineralSchema
      );
      if (mineralData) {
        const validMinerals = [
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
        ];

        const filteredMineralData = mineralData
          .map((mineral) => mineral.toLowerCase())
          .filter((mineral) => validMinerals.includes(mineral));
        
        await db
          .update(nutritionInfoTable)
          .set({
            minerals: toValidStringArrayOrNull(filteredMineralData),
          })
          .where(eq(nutritionInfoTable.foodProductId, Number(id)));
      }
    } catch (error) {
      logger.error(
        `Error fetching or processing image for key: ${imageKey}`,
        error
      );
      return;
    }
  }
};

relabelVitaminsAndMinerals();
