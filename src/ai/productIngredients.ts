import { FoodIngredientDetails } from "@/types/prompt";
import { ingredientsSchema } from "./schema";
import { generateData } from "../utils/ai";

export const processIngredientsLabel = async (
  ingredientsLabel: Express.Multer.File,
  model: string = "gemini-2.0-flash-lite"
) => {
  const ingredientsLabelData = await generateData<FoodIngredientDetails>(
    model,
    ingredientsLabel,
    "List the ingredients, additives and allergens based on the JSON structure",
    ingredientsSchema
  );

  // logger.info({
  //   message: "Ingredients label processed",
  //   img_id: imageID,
  //   ingredients_label_key: ingredientsLabelKey,
  //   ingredients_label_data: ingredientsLabelData,
  // });

  return ingredientsLabelData;
};
