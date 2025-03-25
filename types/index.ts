import * as schema from "../src/db/schema";
import {
  FoodIngredientDetails,
  FoodProduct,
  NutritionInfoCategory,
  NutritionInfoDetails,
  NutritionInfoServings,
} from "./prompt";

export type FoodProductDB = typeof schema.foodProductsTable.$inferSelect;
export type FoodCategoryDB = typeof schema.foodCategoryTable.$inferSelect;
export type NutritionInfoDB = typeof schema.nutritionInfoTable.$inferSelect;
export type ImageDB = typeof schema.imagesTable.$inferSelect;
export type ImageFoodProductDB =
  typeof schema.imageFoodProductsTable.$inferSelect;
export type UserDB = typeof schema.usersTable.$inferSelect;

export type ServerFoodProduct = {
  food_products: FoodProductDB;
  food_category: FoodCategoryDB;
  images: (ImageDB & { type: string })[];
};

export type ServerFoodProductDetails = ServerFoodProduct & {
  nutrition_info: NutritionInfoDB;
};

export interface NewFoodProductFormData
  extends FoodProduct,
    NutritionInfoServings,
    NutritionInfoDetails,
    NutritionInfoCategory,
    FoodIngredientDetails {
      barcode: string[] | string;
      verified: string;
    }
