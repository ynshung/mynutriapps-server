import { db } from "@/src/db";
import { foodCategoryTable, foodProductsTable } from "@/src/db/schema";
import { listCategoryChildren } from "@/src/routes/category";
import { createProduct } from "@/src/routes/product";
import { genAI } from "@/src/utils/ai";
import { bufferToMulter, fetchImageAsMulter } from "@/src/utils/fetchImage";
import { isValidEAN13 } from "@/src/utils/isValidEAN13";
import { logger } from "@/src/utils/logger";
import { uploadProductImages } from "@/src/utils/product";
import { Type } from "@google/genai";
import { arrayContains, count, eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

interface ScrapedData {
  [key: string]: {
    // barcode
    [key: string]: {
      // website name
      name: string;
      link: string;
      image: string;
      price?: string;
      sold?: string;
    };
  };
}

interface ProductDataType {
  product: {
    images: {
      [key: string]: {
        imgid: string;
        sizes: {
          400: {
            h: number;
            w: number;
          };
          full: {
            h: number;
            w: number;
          };
        };
      };
    };
  };
  status: number; // 1 - available, 0 - not available
}

const insertScraping = async () => {
  const filePath = path.resolve(__dirname, "./consolidated.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  const scrapedData: ScrapedData = JSON.parse(rawData);

  const categories = await listCategoryChildren();
  const categoryEnum = Object.values(categories);

  for (const barcode in scrapedData) {
    //? Checkpoint!
    if (Number(barcode) < 9556439885165) continue;
    if (!isValidEAN13(barcode)) continue;
    delete scrapedData[barcode].validEAN13;

    const dbProduct = await db
      .select({
        count: count(),
      })
      .from(foodProductsTable)
      .where(arrayContains(foodProductsTable.barcode, [barcode]));

    if (dbProduct[0].count > 0) {
      // logger.info(`Product with barcode ${barcode} already exists in the database.`);
      continue;
    }

    logger.info(`Processing barcode: ${barcode}`);
    const offImages = await getOFFImages(barcode);

    if (offImages) {
      const {
        front: frontLabel,
        nutrition: nutritionLabel,
        ingredients,
      } = offImages;
      const [frontLabelFile, nutritionLabelFile, ingredientsFile] =
        await Promise.all([
          frontLabel ? fetchImageAsMulter(frontLabel) : undefined,
          nutritionLabel ? fetchImageAsMulter(nutritionLabel) : undefined,
          ingredients ? fetchImageAsMulter(ingredients) : undefined,
        ]);

      if (frontLabelFile !== undefined) {
        await createProduct(barcode, 0, {
          frontLabel: frontLabelFile,
          nutritionLabel: nutritionLabelFile,
          ingredients: ingredientsFile,
        });
  
        logger.info(
          `[OFF] Product with barcode ${barcode} inserted into the database.`
        );
        continue;
      }
    }
    const productData = Object.values(scrapedData[barcode]);
    let frontImage: ArrayBuffer;
    let productName: string;
    let productBrand: string;
    let productCategory: string;

    const productImagesBuffer = await Promise.all(
      productData.map(async (data) => {
        try {
          if (!data.image) return null;
          const imageResponse = await fetch(data.image);
          if (!imageResponse.ok) return null;
          return await imageResponse.arrayBuffer();
        } catch {
          return null;
        }
      })
    ).then((results) => results.filter((item) => item !== null));

    const productImagesBufferAI = productImagesBuffer.map((buffer) => {
      return {
        inlineData: {
          mimeType: "image/jpeg",
          data: Buffer.from(buffer).toString("base64"),
        },
      };
    });

    if (productImagesBuffer.length === 0) {
      continue;
    } else if (productImagesBuffer.length > 1) {
      const responseSchema = {
        type: Type.OBJECT,
        required: ["productName", "bestImage", "category"],
        properties: {
          bestImage: {
            type: Type.NUMBER,
          },
          productName: {
            type: Type.STRING,
          },
          productBrand: {
            type: Type.STRING,
          },
          category: {
            type: Type.STRING,
            description:
              "Category of the food product, set to Uncategorized if no suitable category",
            enum: categoryEnum,
          },
        },
      };

      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash-lite",
        config: {
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens: 128,
        },
        contents: [
          ...productImagesBufferAI,
          {
            text: `Which image of a food product has the highest quality? Only state the number. The following is the variation of name given for each image, extract the suitable name and brand, excluding the weight or quantity. Select a suitable category of the food product. You may suggest a new name if the below name are not suitable. ${productData
              .map((data) => data.name)
              .join("\n")}`,
          },
        ],
      });
      logger.info({
        message: "Tokens used",
        usage: {
          inputToken: result.usageMetadata?.promptTokenCount,
          outputToken: result.usageMetadata?.candidatesTokenCount,
        },
        model: "gemini-2.0-flash-lite",
        barcode: barcode,
        type: "images",
      });

      if (result.text === undefined) {
        logger.warn("Empty response from model.");
        continue;
      }

      const parsedResult: {
        bestImage: number;
        productName: string;
        productBrand: string;
        category: string;
      } = JSON.parse(result.text);

      frontImage = productImagesBuffer[parsedResult.bestImage];
      productName = parsedResult.productName;
      productBrand = parsedResult.productBrand || "Unknown";
      productCategory = parsedResult.category;
    } else {
      const responseSchema = {
        type: Type.OBJECT,
        required: ["productName", "category"],
        properties: {
          productName: {
            type: Type.STRING,
          },
          productBrand: {
            type: Type.STRING,
          },
          category: {
            type: Type.STRING,
            description:
              "Category of the food product, set to Uncategorized if no suitable category",
            enum: categoryEnum,
          },
        },
      };

      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash-lite",
        config: {
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens: 128,
        },
        contents: `Extract the suitable name and brand from the text and select a suitable category of the food product, convert to capital case if necessary: ${productData[0].name}`,
      });
      logger.info({
        message: "Tokens used",
        usage: {
          inputToken: result.usageMetadata?.promptTokenCount,
          outputToken: result.usageMetadata?.candidatesTokenCount,
        },
        model: "gemini-2.0-flash-lite",
        barcode: barcode,
        type: "extract",
      });

      if (result.text === undefined) {
        logger.warn("Empty response from model.");
        continue;
      }
      const parsedResult: {
        productName: string;
        productBrand: string;
        category: string;
      } = JSON.parse(result.text);

      frontImage = productImagesBuffer[0];
      productName = parsedResult.productName;
      productBrand = parsedResult.productBrand || "Unknown";
      productCategory = parsedResult.category;
    }

    let categoryId = 0;
    if (frontImage === undefined) continue;

    await db.transaction(async (tx) => {
      const categoryQueryResult = await tx
        .select()
        .from(foodCategoryTable)
        .where(eq(foodCategoryTable.name, productCategory));
      if (categoryQueryResult.length === 0) {
        logger.error("Unexpected error: Category not found");
        throw new Error("Unexpected error: Category not found");
      } else {
        categoryId = categoryQueryResult[0].id;
      }

      const result = await tx
        .insert(foodProductsTable)
        .values({
          name: productName,
          brand: productBrand,
          barcode: [barcode],
          foodCategoryId: categoryId,
          createdBy: 0,
        })
        .returning({
          id: foodProductsTable.id,
        });

      await uploadProductImages(
        result[0].id,
        {
          frontLabelImage: bufferToMulter(
            Buffer.from(frontImage),
            `${barcode}-frontLabel.jpg`,
            "image/jpeg"
          ),
        },
        0,
        tx
      );
      logger.info(
        `[Upload] Product with barcode ${barcode} inserted into the database.`
      );
    });
  }
};

interface ImageData {
  front?: string;
  nutrition?: string;
  ingredients?: string;
}

async function getOFFImages(barcode: string): Promise<ImageData | null> {
  const imageDataUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?product_type=food&fields=images`;
  const response = await fetch(imageDataUrl);
  const productData: ProductDataType = await response.json();

  if (!productData || !productData.product || !productData.product.images) {
    return null;
  }

  const validPrefixes = ["front", "nutrition", "ingredients"];
  const prioritySuffixes = ["_en", "_ms"];

  const result: ImageData = {};

  const checkUrlExists = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  };

  for (const prefix of validPrefixes) {
    const keys = Object.keys(productData.product.images).filter((k) =>
      k.startsWith(prefix)
    );
    const prioritizedKeys = prioritySuffixes
      .map((suffix) => keys.filter((k) => k.endsWith(suffix)))
      .flat();

    const filteredKeys = [...new Set([...prioritizedKeys, ...keys])];

    for (const key of filteredKeys) {
      const imgid = productData.product.images[key].imgid;
      const url = getProductImageUrl(barcode, imgid);
      if (await checkUrlExists(url)) {
        result[prefix as keyof ImageData] = url;
        break; // Stop at the first valid image
      }
    }
  }

  // if all three are blank
  if (!result.front && !result.nutrition && !result.ingredients) {
    return null;
  }

  return result;
}

function getProductImageUrl(barcode: string, imgid: string): string {
  const paddedBarcode = barcode.padStart(13, "0");
  const match = paddedBarcode.match(/^(...)(...)(...)(.*)$/);

  if (!match) {
    throw new Error("Invalid barcode format");
  }

  const [, part1, part2, part3, part4] = match;

  return `https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/${part1}/${part2}/${part3}/${part4}/${imgid}.jpg`;
}

(async () => {
  while (true) {
    try {
      await insertScraping();
      break;
    } catch (error) {
      logger.error("Error encountered, restarting process:", error);
      await new Promise((resolve) =>
        setTimeout(resolve, 10000)
      );
    }
  }
})();
