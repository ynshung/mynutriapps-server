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
  nutrition_info: NutritionInfoDB | null;
  isUserFavorite: boolean;
  quartiles:
    | Record<keyof NutritionInfoDB | "additives", number | undefined>
    | undefined;
};

export interface NewFoodProductFormData
  extends FoodProduct,
    NutritionInfoServings,
    NutritionInfoDetails,
    NutritionInfoCategory,
    FoodIngredientDetails {
  barcode: string[] | string;
  verified: string;
  front_label_url?: string;
  nutrition_label_url?: string;
  ingredients_url?: string;
}

// For product card
export type ProductCardType = {
  id: number;
  name: string | null;
  brand: string | null;
  category: string;
  verified: boolean | null;
  images: Record<string, string>;
  favorite?: boolean;
  createdAt?: Date; // might be missing on some query
  quartile: schema.ProductScore | null;
  allergens?: boolean;
};

export type RelatedProductCardType = {
  recommendedProducts: (ProductCardType & {
    recommended: {
      id: number;
      similarity?: number;
      score: number;
      nutrition: NutritionInfoDB;
      weightedScore: number;
      scoreDiff: number;
      nutritionComparison: Record<string, number>;
      nutritionMoreIsBetterUserGoal: Record<string, boolean>;
    };
  })[];
  similarProducts: ProductCardType[];
};

// For product card
// TODO: Show image (might need resizing) and favorite on search results
export type ProductSearchResult = {
  id: number;
  name: string | null;
  brand: string | null;
};

export type ProductSearchResultMS = (ProductSearchResult & SearchResult)[];
export type ProductSuggestions = Suggestion[];
