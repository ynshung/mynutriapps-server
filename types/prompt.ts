export interface FoodProduct {
  name: string;
  brand: string;
  category: string;
}

export interface NutritionInfoServings {
  servingSize?: number;
  servingSizeUnit?: string;
  servingSizePerUnit?: number;
}

export interface NutritionInfoDetails {
  calories?: number;
  fat?: number;
  carbs?: number;
  protein?: number;
  sugar?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  saturatedFat?: number;
  transFat?: number;
  fiber?: number;
  sodium?: number;
  cholesterol?: number;
}

export interface NutritionInfoCategory {
  vitamins?: string[] | string;
  minerals?: string[] | string;
  uncategorized?: string[] | string;
}

export interface FoodIngredientDetails {
  ingredients?: string;
  additives?: string[] | string;
  allergens?: string[] | string;
}

export interface NutritionInfoFull
  extends NutritionInfoServings,
    NutritionInfoDetails,
    NutritionInfoCategory {
  extractableTable: boolean;
}

/**
 * @deprecated
 */
export interface NutritionDetails {
  caloriesKcal?: number;
  caloriesKJ?: number;
  fat?: number;
  carbs?: number;
  protein?: number;
  sugar?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  saturatedFat?: number;
  transFat?: number;
  fiber?: number;
  sodium?: number;
  cholesterol?: number;
}

/**
 * @deprecated
 */
export interface NutritionInfo {
  extractableTable: boolean;

  servingSize?: number;
  servingSizeUnit?: string;
  servingSizePerUnit?: number;

  per100g?: NutritionDetails;
  perServing?: NutritionDetails;

  vitamins?: string[];
  minerals?: string[];
  uncategorized?: string[];
}

/**
 * @deprecated
 */
export interface NutritionInfoSingle {
  extractableTable: boolean;

  servingSize?: number;
  servingSizeUnit?: string;
  servingSizePerUnit?: number;

  calories?: number;
  fat?: number;
  carbs?: number;
  protein?: number;
  sugar?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  saturatedFat?: number;
  transFat?: number;
  fiber?: number;
  sodium?: number;
  cholesterol?: number;

  vitamins?: string[];
  minerals?: string[];
  uncategorized?: string[];
}
