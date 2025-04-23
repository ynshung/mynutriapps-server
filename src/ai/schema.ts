import { Schema, Type } from "@google/genai";
import { listCategoryChildren } from "../routes/category";

export async function getFoodProductSchema(): Promise<Schema> {
  // TODO: List all aliases instead of main category name
  const categories = await listCategoryChildren();
  const categoryEnum = Object.values(categories);

  return {
    type: Type.OBJECT,
    description: "Information of food product",
    properties: {
      name: {
        type: Type.STRING,
        description: "Concise name of the food product, may include brand name",
      },
      brand: {
        type: Type.STRING,
        description: "Brand of the food product",
      },
      category: {
        type: Type.STRING,
        description:
          "Category of the food product, set to Uncategorized if no suitable category",
        enum: categoryEnum,
      },
    },
  };
}

/**
 * @deprecated
 */
export const nutritionInfoSchema: Schema = {
  description: "Nutritional data of food product",
  type: Type.OBJECT,
  properties: {
    extractableTable: {
      type: Type.BOOLEAN,
      description:
        "Define whether nutritional table is available and its data extractable from the image",
      nullable: false,
    },
    servingSize: {
      type: Type.NUMBER,
      description: "Servings per unit/package",
    },
    servingSizeUnit: {
      type: Type.STRING,
      description: "Unit of serving size (in lowercase). Example: ml, g",
    },
    servingSizePerUnit: {
      type: Type.NUMBER,
      description: "Number of servings in the food product",
    },
    per100g: {
      type: Type.OBJECT,
      description: "Nutritional information per 100g or 100ml",
      properties: {
        caloriesKcal: {
          type: Type.NUMBER,
          description: "Calories per 100g or 100ml (in kcal)",
        },
        caloriesKJ: {
          type: Type.NUMBER,
          description: "Calories per 100g or 100ml (in kJ)",
        },
        fat: {
          type: Type.NUMBER,
          description: "Fat content per 100g or 100ml (in grams)",
        },
        carbs: {
          type: Type.NUMBER,
          description: "Carbohydrate content per 100g or 100ml (in grams)",
        },
        protein: {
          type: Type.NUMBER,
          description: "Protein content per 100g or 100ml (in grams)",
        },
        sugar: {
          type: Type.NUMBER,
          description: "Sugar content per 100g or 100ml (in grams)",
        },
        monounsaturatedFat: {
          type: Type.NUMBER,
          description:
            "Monounsaturated fat content per 100g or 100ml (in grams)",
        },
        polyunsaturatedFat: {
          type: Type.NUMBER,
          description:
            "Polyunsaturated fat content per 100g or 100ml (in grams)",
        },
        saturatedFat: {
          type: Type.NUMBER,
          description: "Saturated fat content per 100g or 100ml (in grams)",
        },
        transFat: {
          type: Type.NUMBER,
          description: "Trans fat content per 100g or 100ml (in grams)",
        },
        fiber: {
          type: Type.NUMBER,
          description: "Fiber content per 100g or 100ml (in grams)",
        },
        sodium: {
          type: Type.NUMBER,
          description: "Sodium content per 100g or 100ml (in milligrams)",
        },
        cholesterol: {
          type: Type.NUMBER,
          description: "Cholesterol content per 100g or 100ml (in milligrams)",
        },
      },
    },
    perServing: {
      type: Type.OBJECT,
      description: "Nutritional information per serving size",
      properties: {
        caloriesKcal: {
          type: Type.NUMBER,
          description: "Calories per serving size (in kcal)",
        },
        caloriesKJ: {
          type: Type.NUMBER,
          description: "Calories per serving size (in kJ)",
        },
        fat: {
          type: Type.NUMBER,
          description: "Fat content per serving size (in grams)",
        },
        carbs: {
          type: Type.NUMBER,
          description: "Carbohydrate content per serving size (in grams)",
        },
        protein: {
          type: Type.NUMBER,
          description: "Protein content per serving size (in grams)",
        },
        sugar: {
          type: Type.NUMBER,
          description: "Sugar content per serving size (in grams)",
        },
        monounsaturatedFat: {
          type: Type.NUMBER,
          description:
            "Monounsaturated fat content per serving size (in grams)",
        },
        polyunsaturatedFat: {
          type: Type.NUMBER,
          description:
            "Polyunsaturated fat content per serving size (in grams)",
        },
        saturatedFat: {
          type: Type.NUMBER,
          description: "Saturated fat content per serving size (in grams)",
        },
        transFat: {
          type: Type.NUMBER,
          description: "Trans fat content per serving size (in grams)",
        },
        fiber: {
          type: Type.NUMBER,
          description: "Fiber content per serving size (in grams)",
        },
        sodium: {
          type: Type.NUMBER,
          description: "Sodium content per serving size (in milligrams)",
        },
        cholesterol: {
          type: Type.NUMBER,
          description: "Cholesterol content per serving size (in milligrams)",
        },
      },
    },
    vitamins: {
      type: Type.ARRAY,
      description:
        "List of available vitamins in the food product (if any, only the alphabet). Example: a,b,c",
      items: {
        type: Type.STRING,
      },
    },
    minerals: {
      type: Type.ARRAY,
      description:
        "List of available minerals in the food product, excluding sodium (if any, underscore case in English)",
      items: {
        type: Type.STRING,
      },
    },
    uncategorized: {
      type: Type.ARRAY,
      description:
        "List the remaining nutritional information that are not covered in any other (if any, underscore case in English)",
      items: {
        type: Type.STRING,
      },
    },
  },
};

/**
 * @deprecated
 */
export const nutritionInfoSchemaSingle: Schema = {
  type: Type.OBJECT,
  properties: {
    servingSize: {
      type: Type.NUMBER,
      description: "Servings per unit/package",
    },
    servingSizeUnit: {
      type: Type.STRING,
      description: "Unit of serving size (in lowercase). Example: ml, g",
      enum: ["g", "ml"],
    },
    servingSizePerUnit: {
      type: Type.NUMBER,
      description: "Number of servings in the food product",
    },
    calories: {
      type: Type.NUMBER,
      description: "Calories (in kcal)",
    },
    fat: {
      type: Type.NUMBER,
      description: "Total fat content (in g)",
    },
    carbs: {
      type: Type.NUMBER,
      description: "Carbohydrate content (in g)",
    },
    protein: {
      type: Type.NUMBER,
      description: "Protein content (in g)",
    },
    sugar: {
      type: Type.NUMBER,
      description: "Sugar content (in g)",
    },
    monounsaturatedFat: {
      type: Type.NUMBER,
      description: "Monounsaturated fat content (in g)",
    },
    polyunsaturatedFat: {
      type: Type.NUMBER,
      description: "Polyunsaturated fat content (in g)",
    },
    saturatedFat: {
      type: Type.NUMBER,
      description: "Saturated fat content (in g)",
    },
    transFat: {
      type: Type.NUMBER,
      description: "Trans fat content (in g)",
    },
    fiber: {
      type: Type.NUMBER,
      description: "Fiber content (in g)",
    },
    sodium: {
      type: Type.NUMBER,
      description: "Sodium content (in mg)",
    },
    cholesterol: {
      type: Type.NUMBER,
      description: "Cholesterol content (in mg)",
    },
    vitamins: {
      type: Type.ARRAY,
      description: "Available vitamins in the nutrition label",
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
    },
    minerals: {
      type: Type.ARRAY,
      description: "Available minerals in the nutrition label",
      items: {
        type: Type.STRING,
        enum: [
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
        ],
      },
    },
    uncategorized: {
      type: Type.ARRAY,
      description:
        "List the remaining nutritional information that are not covered in vitamins and minerals",
      items: {
        type: Type.STRING,
      },
    },
  },
};

export const nutritionInfoAvailableSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    extractableTable: {
      type: Type.BOOLEAN,
      description:
        "Whether nutritional table is available and its data extractable from the image",
      nullable: false,
    },
    perServingAvailable: {
      type: Type.BOOLEAN,
      description:
        "Whether nutritional information per serving is available",
      nullable: false,
    },
    per100gAvailable: {
      type: Type.BOOLEAN,
      description:
        "Whether nutritional information per 100g is available",
      nullable: false,
    },
  },
};

export const nutritionInfoServingsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    servingSize: {
      type: Type.NUMBER,
      description: "Serving size (in g or ml)",
    },
    servingSizeUnit: {
      type: Type.STRING,
      description: "Unit of serving size (in lowercase). Example: ml, g",
      enum: ["g", "ml"],
    },
    servingSizePerUnit: {
      type: Type.NUMBER,
      description: "Number of total servings in the food product",
    },
  },
};

export const nutritionInfoDetailsSchema: Schema = {
  type: Type.OBJECT,
  description: "Nutritional information of the food product, all fields are optional",
  properties: {
    calories: {
      type: Type.NUMBER,
      description: "Calories (in kcal)",
    },
    fat: {
      type: Type.NUMBER,
      description: "Total fat content (in g)",
    },
    carbs: {
      type: Type.NUMBER,
      description: "Carbohydrate content (in g)",
    },
    protein: {
      type: Type.NUMBER,
      description: "Protein content (in g)",
    },
    sugar: {
      type: Type.NUMBER,
      description: "Sugar content (in g)",
    },
    monounsaturatedFat: {
      type: Type.NUMBER,
      description: "Monounsaturated fat content (in g)",
    },
    polyunsaturatedFat: {
      type: Type.NUMBER,
      description: "Polyunsaturated fat content (in g)",
    },
    saturatedFat: {
      type: Type.NUMBER,
      description: "Saturated fat content (in g)",
    },
    transFat: {
      type: Type.NUMBER,
      description: "Trans fat content (in g)",
    },
    fiber: {
      type: Type.NUMBER,
      description: "Fiber content (in g)",
    },
    sodium: {
      type: Type.NUMBER,
      description: "Sodium content (in mg)",
    },
    cholesterol: {
      type: Type.NUMBER,
      description: "Cholesterol content (in mg)",
    },
  },
};

export const nutritionInfoCategorySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    vitamins: {
      type: Type.ARRAY,
      description: "Available vitamins in the nutrition label",
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
    },
    minerals: {
      type: Type.ARRAY,
      description: "Available minerals in the nutrition label",
      items: {
        type: Type.STRING,
        enum: [
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
        ],
      },
    },
    // uncategorized: {
    //   type: Type.ARRAY,
    //   description:
    //     // TODO: It might include the contents such as calories sodium etc
    //     "List the remaining nutritional information that are not covered",
    //   items: {
    //     type: Type.STRING,
    //   },
    // },
  },
};

export const ingredientsSchema: Schema = {
  description: "List of ingredients of the food product",
  type: Type.OBJECT,
  properties: {
    ingredients: {
      type: Type.STRING,
      description: "All ingredients listed in the food product",
    },
    additives: {
      type: Type.ARRAY,
      description:
        "List of additives in the food product, do not modify the text if possible",
      items: {
        type: Type.STRING,
      },
    },
    allergens: {
      type: Type.ARRAY,
      description: "List of allergens in the food product",
      items: {
        type: Type.STRING,
        enum: [
          "milk",
          "egg",
          "peanut",
          "soy",
          "wheat",
          "treeNuts",
          "sesame",
          "shellfish",
          "fish",
        ],
      },
    },
  },
};
