import { FoodProduct } from "@/types/prompt";
import { getFoodProductSchema } from "./schema";
import { generateData } from "../utils/ai";

export const processFrontLabel = async (
  frontLabelBuffer: Buffer<ArrayBufferLike>,
  model: string = "gemini-2.0-flash-lite"
) => {
  const frontLabelData = await generateData<FoodProduct>(
    model,
    frontLabelBuffer,
    "Extract the product name, brand and category based on the JSON structure",
    await getFoodProductSchema()
  );

  // logger.info({
  //   message: "Front label processed",
  //   img_id: imageID,
  //   front_label_key: frontLabelKey,
  //   front_label_data: frontLabelData,
  // });

  return frontLabelData;
};
