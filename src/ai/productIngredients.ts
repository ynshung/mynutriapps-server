import { FoodIngredientDetails } from "@/types/prompt";
import { ingredientsSchema } from "./schema";
import { generateData } from "../utils/ai";

export const processIngredientsLabel = async (
  ingredientsLabelBuffer: Buffer<ArrayBufferLike>,
  model: string = "gemini-2.0-flash-lite"
) => {
  const ingredientsLabelData = await generateData<FoodIngredientDetails>(
    model,
    ingredientsLabelBuffer,
    "List the ingredients, additives and allergens in the food product (only in English if available).",
    ingredientsSchema,
    1024
  );

  // logger.info({
  //   message: "Ingredients label processed",
  //   img_id: imageID,
  //   ingredients_label_key: ingredientsLabelKey,
  //   ingredients_label_data: ingredientsLabelData,
  // });

  return ingredientsLabelData;
};
