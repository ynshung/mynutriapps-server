import { Schema, SchemaType } from "@google/generative-ai";
import { listCategory } from "../routes/category";

export async function getFoodProductSchema(): Promise<Schema> {
  const categories = await listCategory();
  const categoryEnum = Object.values(categories);

  return {
    type: SchemaType.OBJECT,
    description: "Information of food product",
    properties: {
      name: {
        type: SchemaType.STRING,
        description: "Concise name of the food product, may include brand name",
      },
      brand: {
        type: SchemaType.STRING,
        description: "Brand of the food product",
      },
      category: {
        type: SchemaType.STRING,
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
  type: SchemaType.OBJECT,
  properties: {
    extractableTable: {
      type: SchemaType.BOOLEAN,
      description:
        "Define whether nutritional table is available and its data extractable from the image",
      nullable: false,
    },
    servingSize: {
      type: SchemaType.NUMBER,
      description: "Servings per unit/package",
    },
    servingSizeUnit: {
      type: SchemaType.STRING,
      description: "Unit of serving size (in lowercase). Example: ml, g",
    },
    servingSizePerUnit: {
      type: SchemaType.NUMBER,
      description: "Number of servings in the food product",
    },
    per100g: {
      type: SchemaType.OBJECT,
      description: "Nutritional information per 100g or 100ml",
      properties: {
        caloriesKcal: {
          type: SchemaType.NUMBER,
          description: "Calories per 100g or 100ml (in kcal)",
        },
        caloriesKJ: {
          type: SchemaType.NUMBER,
          description: "Calories per 100g or 100ml (in kJ)",
        },
        fat: {
          type: SchemaType.NUMBER,
          description: "Fat content per 100g or 100ml (in grams)",
        },
        carbs: {
          type: SchemaType.NUMBER,
          description: "Carbohydrate content per 100g or 100ml (in grams)",
        },
        protein: {
          type: SchemaType.NUMBER,
          description: "Protein content per 100g or 100ml (in grams)",
        },
        sugar: {
          type: SchemaType.NUMBER,
          description: "Sugar content per 100g or 100ml (in grams)",
        },
        monounsaturatedFat: {
          type: SchemaType.NUMBER,
          description:
            "Monounsaturated fat content per 100g or 100ml (in grams)",
        },
        polyunsaturatedFat: {
          type: SchemaType.NUMBER,
          description:
            "Polyunsaturated fat content per 100g or 100ml (in grams)",
        },
        saturatedFat: {
          type: SchemaType.NUMBER,
          description: "Saturated fat content per 100g or 100ml (in grams)",
        },
        transFat: {
          type: SchemaType.NUMBER,
          description: "Trans fat content per 100g or 100ml (in grams)",
        },
        fiber: {
          type: SchemaType.NUMBER,
          description: "Fiber content per 100g or 100ml (in grams)",
        },
        sodium: {
          type: SchemaType.NUMBER,
          description: "Sodium content per 100g or 100ml (in milligrams)",
        },
        cholesterol: {
          type: SchemaType.NUMBER,
          description: "Cholesterol content per 100g or 100ml (in milligrams)",
        },
      },
    },
    perServing: {
      type: SchemaType.OBJECT,
      description: "Nutritional information per serving size",
      properties: {
        caloriesKcal: {
          type: SchemaType.NUMBER,
          description: "Calories per serving size (in kcal)",
        },
        caloriesKJ: {
          type: SchemaType.NUMBER,
          description: "Calories per serving size (in kJ)",
        },
        fat: {
          type: SchemaType.NUMBER,
          description: "Fat content per serving size (in grams)",
        },
        carbs: {
          type: SchemaType.NUMBER,
          description: "Carbohydrate content per serving size (in grams)",
        },
        protein: {
          type: SchemaType.NUMBER,
          description: "Protein content per serving size (in grams)",
        },
        sugar: {
          type: SchemaType.NUMBER,
          description: "Sugar content per serving size (in grams)",
        },
        monounsaturatedFat: {
          type: SchemaType.NUMBER,
          description:
            "Monounsaturated fat content per serving size (in grams)",
        },
        polyunsaturatedFat: {
          type: SchemaType.NUMBER,
          description:
            "Polyunsaturated fat content per serving size (in grams)",
        },
        saturatedFat: {
          type: SchemaType.NUMBER,
          description: "Saturated fat content per serving size (in grams)",
        },
        transFat: {
          type: SchemaType.NUMBER,
          description: "Trans fat content per serving size (in grams)",
        },
        fiber: {
          type: SchemaType.NUMBER,
          description: "Fiber content per serving size (in grams)",
        },
        sodium: {
          type: SchemaType.NUMBER,
          description: "Sodium content per serving size (in milligrams)",
        },
        cholesterol: {
          type: SchemaType.NUMBER,
          description: "Cholesterol content per serving size (in milligrams)",
        },
      },
    },
    vitamins: {
      type: SchemaType.ARRAY,
      description:
        "List of available vitamins in the food product (if any, only the alphabet). Example: a,b,c",
      items: {
        type: SchemaType.STRING,
      },
    },
    minerals: {
      type: SchemaType.ARRAY,
      description:
        "List of available minerals in the food product, excluding sodium (if any, underscore case in English)",
      items: {
        type: SchemaType.STRING,
      },
    },
    uncategorized: {
      type: SchemaType.ARRAY,
      description:
        "List the remaining nutritional information that are not covered in any other (if any, underscore case in English)",
      items: {
        type: SchemaType.STRING,
      },
    },
  },
};

/**
 * @deprecated
 */
export const nutritionInfoSchemaSingle: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    servingSize: {
      type: SchemaType.NUMBER,
      description: "Servings per unit/package",
    },
    servingSizeUnit: {
      type: SchemaType.STRING,
      description: "Unit of serving size (in lowercase). Example: ml, g",
      enum: ["g", "ml"],
    },
    servingSizePerUnit: {
      type: SchemaType.NUMBER,
      description: "Number of servings in the food product",
    },
    calories: {
      type: SchemaType.NUMBER,
      description: "Calories (in kcal)",
    },
    fat: {
      type: SchemaType.NUMBER,
      description: "Total fat content (in g)",
    },
    carbs: {
      type: SchemaType.NUMBER,
      description: "Carbohydrate content (in g)",
    },
    protein: {
      type: SchemaType.NUMBER,
      description: "Protein content (in g)",
    },
    sugar: {
      type: SchemaType.NUMBER,
      description: "Sugar content (in g)",
    },
    monounsaturatedFat: {
      type: SchemaType.NUMBER,
      description: "Monounsaturated fat content (in g)",
    },
    polyunsaturatedFat: {
      type: SchemaType.NUMBER,
      description: "Polyunsaturated fat content (in g)",
    },
    saturatedFat: {
      type: SchemaType.NUMBER,
      description: "Saturated fat content (in g)",
    },
    transFat: {
      type: SchemaType.NUMBER,
      description: "Trans fat content (in g)",
    },
    fiber: {
      type: SchemaType.NUMBER,
      description: "Fiber content (in g)",
    },
    sodium: {
      type: SchemaType.NUMBER,
      description: "Sodium content (in mg)",
    },
    cholesterol: {
      type: SchemaType.NUMBER,
      description: "Cholesterol content (in mg)",
    },
    vitamins: {
      type: SchemaType.ARRAY,
      description: "Available vitamins in the nutrition label",
      items: {
        type: SchemaType.STRING,
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
      type: SchemaType.ARRAY,
      description: "Available minerals in the nutrition label",
      items: {
        type: SchemaType.STRING,
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
      type: SchemaType.ARRAY,
      description:
        "List the remaining nutritional information that are not covered in vitamins and minerals",
      items: {
        type: SchemaType.STRING,
      },
    },
  },
};

export const nutritionInfoAvailableSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    extractableTable: {
      type: SchemaType.BOOLEAN,
      description:
        "Whether nutritional table is available and its data extractable from the image",
      nullable: false,
    },
    perServingAvailable: {
      type: SchemaType.BOOLEAN,
      description:
        "Whether nutritional information per serving is available",
      nullable: false,
    },
    per100gAvailable: {
      type: SchemaType.BOOLEAN,
      description:
        "Whether nutritional information per 100g is available",
      nullable: false,
    },
  },
};

export const nutritionInfoServingsSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    servingSize: {
      type: SchemaType.NUMBER,
      description: "Serving size (in g or ml)",
    },
    servingSizeUnit: {
      type: SchemaType.STRING,
      description: "Unit of serving size (in lowercase). Example: ml, g",
      enum: ["g", "ml"],
    },
    servingSizePerUnit: {
      type: SchemaType.NUMBER,
      description: "Number of total servings in the food product",
    },
  },
};

export const nutritionInfoDetailsSchema: Schema = {
  type: SchemaType.OBJECT,
  description: "Nutritional information of the food product, all fields are optional",
  properties: {
    calories: {
      type: SchemaType.NUMBER,
      description: "Calories (in kcal)",
    },
    fat: {
      type: SchemaType.NUMBER,
      description: "Total fat content (in g)",
    },
    carbs: {
      type: SchemaType.NUMBER,
      description: "Carbohydrate content (in g)",
    },
    protein: {
      type: SchemaType.NUMBER,
      description: "Protein content (in g)",
    },
    sugar: {
      type: SchemaType.NUMBER,
      description: "Sugar content (in g)",
    },
    monounsaturatedFat: {
      type: SchemaType.NUMBER,
      description: "Monounsaturated fat content (in g)",
    },
    polyunsaturatedFat: {
      type: SchemaType.NUMBER,
      description: "Polyunsaturated fat content (in g)",
    },
    saturatedFat: {
      type: SchemaType.NUMBER,
      description: "Saturated fat content (in g)",
    },
    transFat: {
      type: SchemaType.NUMBER,
      description: "Trans fat content (in g)",
    },
    fiber: {
      type: SchemaType.NUMBER,
      description: "Fiber content (in g)",
    },
    sodium: {
      type: SchemaType.NUMBER,
      description: "Sodium content (in mg)",
    },
    cholesterol: {
      type: SchemaType.NUMBER,
      description: "Cholesterol content (in mg)",
    },
  },
};

export const nutritionInfoCategorySchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    vitamins: {
      type: SchemaType.ARRAY,
      description: "Available vitamins in the nutrition label",
      items: {
        type: SchemaType.STRING,
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
      type: SchemaType.ARRAY,
      description: "Available minerals in the nutrition label",
      items: {
        type: SchemaType.STRING,
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
      type: SchemaType.ARRAY,
      description:
        // TODO: It might include the contents such as calories sodium etc
        "List the remaining nutritional information that are not covered",
      items: {
        type: SchemaType.STRING,
      },
    },
  },
};

export const ingredientsSchema: Schema = {
  description: "List of ingredients of the food product",
  type: SchemaType.OBJECT,
  properties: {
    ingredients: {
      type: SchemaType.STRING,
      description: "All ingredients listed in the food product",
    },
    additives: {
      type: SchemaType.ARRAY,
      description:
        "List of additives in the food product, do not modify the text if possible",
      items: {
        type: SchemaType.STRING,
      },
    },
    allergens: {
      type: SchemaType.ARRAY,
      description: "List of allergens in the food product",
      items: {
        type: SchemaType.STRING,
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
