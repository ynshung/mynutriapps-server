import { ResponseFormatTextConfig } from "openai/resources/responses/responses";

// export async function getFoodProductSchema(): Promise<Schema> {
//   // TODO: List all aliases instead of main category name
//   const categories = await listCategoryChildren();
//   const categoryEnum = Object.values(categories);

//   return {
//     type: Type.OBJECT,
//     description: "Information of food product",
//     properties: {
//       name: {
//         type: Type.STRING,
//         description: "Concise name of the food product, may include brand name",
//       },
//       brand: {
//         type: Type.STRING,
//         description: "Brand of the food product",
//       },
//       category: {
//         type: Type.STRING,
//         description:
//           "Category of the food product, set to Uncategorized if no suitable category",
//         enum: categoryEnum,
//       },
//     },
//   };
// }

// export const nutritionInfoAvailableSchema: Schema = {
//   type: Type.OBJECT,
//   properties: {
//     extractableTable: {
//       type: Type.BOOLEAN,
//       description:
//         "Whether nutritional table is available and its data extractable from the image",
//       nullable: false,
//     },
//     perServingAvailable: {
//       type: Type.BOOLEAN,
//       description: "Whether nutritional information per serving is available",
//       nullable: false,
//     },
//     per100gAvailable: {
//       type: Type.BOOLEAN,
//       description: "Whether nutritional information per 100g is available",
//       nullable: false,
//     },
//   },
// };

// export const nutritionInfoServingsSchema: Schema = {
//   type: Type.OBJECT,
//   properties: {
//     servingSize: {
//       type: Type.NUMBER,
//       description: "Serving size (in g or ml)",
//     },
//     servingSizeUnit: {
//       type: Type.STRING,
//       description: "Unit of serving size (in lowercase). Example: ml, g",
//       enum: ["g", "ml"],
//     },
//     servingSizePerUnit: {
//       type: Type.NUMBER,
//       description: "Number of total servings in the food product",
//     },
//   },
// };

export const nutritionInfoDetailsSchema: ResponseFormatTextConfig = {
  type: "json_schema",
  name: "nutrition_info_details",
  schema: {
    type: "object",
    properties: {
      calories: {
        type: ["number", "null"],
        description: "Calories (in kcal)",
      },
      fat: {
        type: ["number", "null"],
        description: "Total fat content (in g)",
      },
      carbs: {
        type: ["number", "null"],
        description: "Carbohydrate content (in g)",
      },
      protein: {
        type: ["number", "null"],
        description: "Protein content (in g)",
      },
      sugar: {
        type: ["number", "null"],
        description: "Sugar content (in g)",
      },
      monounsaturatedFat: {
        type: ["number", "null"],
        description: "Monounsaturated fat content (in g)",
      },
      polyunsaturatedFat: {
        type: ["number", "null"],
        description: "Polyunsaturated fat content (in g)",
      },
      saturatedFat: {
        type: ["number", "null"],
        description: "Saturated fat content (in g)",
      },
      transFat: {
        type: ["number", "null"],
        description: "Trans fat content (in g)",
      },
      fiber: {
        type: ["number", "null"],
        description: "Fiber content (in g)",
      },
      sodium: {
        type: ["number", "null"],
        description: "Sodium content (in mg)",
      },
      cholesterol: {
        type: ["number", "null"],
        description: "Cholesterol content (in mg)",
      },
    },
    required: [
      "calories",
      "fat",
      "carbs",
      "protein",
      "sugar",
      "monounsaturatedFat",
      "polyunsaturatedFat",
      "saturatedFat",
      "transFat",
      "fiber",
      "sodium",
      "cholesterol",
    ],
    additionalProperties: false,
  },
  strict: true,
};

export const nutritionInfoCategorySchema: ResponseFormatTextConfig = {
  type: "json_schema",
  name: "nutrition_info_category",
  schema: {
    type: "object",
    properties: {
      vitamins: {
        type: ["array", "null"],
        description: "Available vitamins in the nutrition label",
        items: {
          type: "string",
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
        type: ["array", "null"],
        description: "Available minerals in the nutrition label",
        items: {
          type: "string",
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
            "sodium",
          ],
        },
      },
    },
    required: ["vitamins", "minerals"],
    additionalProperties: false,
  },
  strict: true,
};

// export const ingredientsSchema: Schema = {
//   description: "List of ingredients of the food product",
//   type: Type.OBJECT,
//   properties: {
//     ingredients: {
//       type: Type.STRING,
//       description: "All ingredients listed in the food product",
//     },
//     additives: {
//       type: Type.ARRAY,
//       description:
//         "List of additives in the food product, do not modify the text if possible",
//       items: {
//         type: Type.STRING,
//       },
//     },
//     allergens: {
//       type: Type.ARRAY,
//       description: "List of allergens in the food product",
//       items: {
//         type: Type.STRING,
//         enum: [
//           "milk",
//           "egg",
//           "peanut",
//           "soy",
//           "wheat",
//           "treeNuts",
//           "sesame",
//           "shellfish",
//           "fish",
//         ],
//       },
//     },
//   },
// };
