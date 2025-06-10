import { FoodIngredientDetails, FoodProduct, NutritionInfoFull } from "@/types/prompt";
import { processFrontLabel } from "../ai/productFrontLabel";
import { processIngredientsLabel } from "../ai/productIngredients";
import { fetchImageAsBuffer } from "../utils/fetchImage";
import { Response } from "express";
import { logger } from "../utils/logger";
import { processNutritionLabelV2 } from "../ai/productNutritionLabel";

interface AdminInferenceProductProps {
  frontLabel?: Express.Multer.File;
  nutritionLabel?: Express.Multer.File;
  ingredients?: Express.Multer.File;
  frontLabelUrl?: string;
  nutritionLabelUrl?: string;
  ingredientsUrl?: string;
  res: Response;
}

interface InferenceResult {
  frontLabelData?: FoodProduct | null;
  nutritionLabelData?: NutritionInfoFull | null;  
  ingredientsLabelData?: FoodIngredientDetails | null;
}

export const adminInferenceProduct = async ({
  frontLabel,
  nutritionLabel,
  ingredients,
  frontLabelUrl,
  nutritionLabelUrl,
  ingredientsUrl,
  res,
}: AdminInferenceProductProps) => {
  const inferenceHandlers = {
    front_label: processFrontLabel,
    nutrition_label: processNutritionLabelV2,
    ingredients: processIngredientsLabel,
  };
  const tasks: Promise<InferenceResult>[] = [];

  if (frontLabel || (frontLabelUrl && frontLabelUrl.startsWith("http"))) {
    tasks.push(
      inferenceHandlers
        .front_label(
          frontLabel && (frontLabel?.size > 0)
            ? frontLabel.buffer
            : await fetchImageAsBuffer(frontLabelUrl!)
        )
        .then((frontLabelData) => ({
          frontLabelData,
        }))
    );
  }
  if (
    nutritionLabel ||
    (nutritionLabelUrl && nutritionLabelUrl.startsWith("http"))
  ) {
    tasks.push(
      inferenceHandlers
        .nutrition_label(
          nutritionLabel && (nutritionLabel?.size > 0)
            ? nutritionLabel.buffer
            : await fetchImageAsBuffer(nutritionLabelUrl!)
        )
        .then((nutritionLabelData) => ({
          nutritionLabelData,
        }))
    );
  }
  if (ingredients || (ingredientsUrl && ingredientsUrl.startsWith("http"))) {
    tasks.push(
      inferenceHandlers
        .ingredients(
          ingredients && (ingredients?.size > 0)
            ? ingredients.buffer
            : await fetchImageAsBuffer(ingredientsUrl!)
        )
        .then((ingredientsLabelData) => ({
          ingredientsLabelData,
        }))
    );
  }

  if (tasks.length === 0) {
    res.status(400).json({
      status: "error",
      message: "At least one image is required",
    });
    return;
  }

  try {
    const results = await Promise.allSettled(tasks);

    const fulfilledResults = results
      .filter((result) => result.status === "fulfilled")
      .map(
        (result) =>
          (
            result as PromiseFulfilledResult<
              InferenceResult & { imageID: string }
            >
          ).value
      );

    const reducedResult = fulfilledResults.reduce(
      (acc: InferenceResult, result) => {
        if (result.frontLabelData) {
          acc.frontLabelData = result.frontLabelData;
        }
        if (result.nutritionLabelData) {
          acc.nutritionLabelData = result.nutritionLabelData;
        }
        if (result.ingredientsLabelData) {
          acc.ingredientsLabelData = result.ingredientsLabelData;
        }
        return acc;
      },
      {}
    );

    const hasRejected = results.some((result) => result.status === "rejected");
    if (hasRejected) {
      logger.warn("Some tasks were rejected", results);
    }

    res.status(201).json({
      status: hasRejected ? "warning" : "success",
      data: reducedResult,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Failed to process images",
    });
  }
};
