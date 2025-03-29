import { SearchResult, Suggestion } from "minisearch";
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

// For full product data
export type ServerFoodProduct = {
  food_products: FoodProductDB;
  food_category: FoodCategoryDB;
  images: (ImageDB & { type: string })[];
};

export type ServerFoodProductDetails = ServerFoodProduct & {
  nutrition_info: NutritionInfoDB;
  isUserFavorite: boolean;
};

export interface NewFoodProductFormData
  extends FoodProduct,
    NutritionInfoServings,
    NutritionInfoDetails,
    NutritionInfoCategory,
    FoodIngredientDetails {
      barcode: string[] | string;
      verified: string
    }

// For product card
export type ProductCardType = {
  id: number;
  name: string | null;
  brand: string | null;
  category: string;
  verified: boolean | null;
  image: string | null;
  favorite?: boolean;
};

// For product card
// TODO: Show image (might need resizing) and favorite on search results
export type ProductSearchResult = Omit<ProductCardType, "image" | "favorite">;

export interface ProductSearchResultsWithSuggestion {
  results: (SearchResult & ProductSearchResult)[];
  suggestions: Suggestion[];
}
