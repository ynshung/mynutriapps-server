import { desc, eq } from "drizzle-orm";
import { AnyPgColumn, boolean, date, index, jsonb, pgView, vector } from "drizzle-orm/pg-core";
import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

export const activityLevelEnum = pgEnum("activity_level", [
  "sedentary",
  "lightlyActive",
  "moderatelyActive",
  "highlyActive",
  "extremelyActive",
]);

const goalValues = [
  "improveHealth",
  "loseWeight",
  "improvePerformance",
  "chronicDisease",
] as const;

export type GoalType = typeof goalValues[number];

export const goalEnum = pgEnum("goal", goalValues);

export const foodProductImageTypes = pgEnum("food_product_image_types", [
  "front",
  "nutritional_table",
  "ingredients",
  "other",
]);

export type ProductScore = {
  score?: number;
  scoreBreakdown?: Record<string, number>;
  total: number;
  quartile?: number;
}

export const usersTable = pgTable("users", {
  id: serial().primaryKey(),
  name: text(),
  email: text().notNull().unique(),
  firebaseUUID: text().notNull().unique(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  profilePicture: uuid().references((): AnyPgColumn => imagesTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),

  dateOfBirth: date(),
  gender: genderEnum(),
  height: numeric(),
  weight: numeric(),

  activityLevel: activityLevelEnum(),
  goal: goalEnum(),
  allergies: text().array(),
  medicalConditions: text().array(),
});

export const imagesTable = pgTable("images", {
  id: uuid().primaryKey().defaultRandom(),
  imageKey: text().notNull(),
  fileName: text().notNull(),
  mimeType: text().notNull(),
  size: integer().notNull(),
  uploadedAt: timestamp().notNull().defaultNow(),
  userID: integer().references(() => usersTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  embedding: vector('embedding', { dimensions: 512 }),
}, (table) => [
  index('embeddingIndex').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);

export const foodCategoryTable = pgTable("food_category", {
  id: serial().primaryKey(),
  name: text().notNull(),
  parentCategory: integer().references(
    (): AnyPgColumn => foodCategoryTable.id,
    {
      onDelete: "set null",
      onUpdate: "cascade",
    }
  ),
  image: uuid().references((): AnyPgColumn => imagesTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  sequence: integer().notNull().default(0),
});

// TODO: Setup indexes
export const foodProductsTable = pgTable("food_products", {
  id: serial().primaryKey(),
  name: text(),
  brand: text(),
  barcode: text().array(),

  ingredients: text(),
  additives: text().array(),
  allergens: text().array(),

  verified: boolean().default(false),

  foodCategoryId: integer()
    .notNull()
    .default(0)
    .references(() => foodCategoryTable.id, {
      onDelete: "set default",
      onUpdate: "cascade",
    }),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  
  score: jsonb().$type<{
    [key in GoalType]?: ProductScore
  }>(),

  createdBy: integer()
    .notNull()
    .default(-1)
    .references(() => usersTable.id, {
      onDelete: "set default",
      onUpdate: "cascade",
    }),
  adminComment: text(),
  hidden: boolean().default(false),
});

export const foodProductPublicView = pgView("food_product_public_view").as(
  (qb) =>
    qb
      .select()
      .from(foodProductsTable)
      .where(eq(foodProductsTable.hidden, false))
      .orderBy(desc(foodProductsTable.createdAt))
);

export const nutritionInfoTable = pgTable("nutrition_info", {
  foodProductId: integer()
    .notNull()
    .references(() => foodProductsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  id: serial().primaryKey(),
  servingSize: numeric(),
  servingSizeUnit: text(),
  servingSizePerUnit: numeric(),
  calories: numeric(),
  fat: numeric(),
  carbs: numeric(),
  protein: numeric(),
  sugar: numeric(),
  monounsaturatedFat: numeric(),
  polyunsaturatedFat: numeric(),
  saturatedFat: numeric(),
  transFat: numeric(),
  cholesterol: numeric(),
  sodium: numeric(),
  fiber: numeric(),
  vitamins: text().array(),
  minerals: text().array(),
  uncategorized: text().array(),
  nutriscore: text(),
});

// TODO - inconsistent naming of Id and ID

export const imageFoodProductsTable = pgTable(
  "image_food_products",
  {
    imageId: uuid()
      .notNull()
      .references(() => imagesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    foodProductId: integer()
      .notNull()
      .references(() => foodProductsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: foodProductImageTypes().notNull(),
  },
  (table) => [primaryKey({ columns: [table.imageId, table.foodProductId] })]
);

export const userProductClicksTable = pgTable("user_product_clicks", {
  userID: integer()
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  foodProductId: integer()
    .notNull()
    .references(() => foodProductsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  clickedAt: timestamp().notNull().defaultNow(),
  userScan: boolean().default(false),
});

export const userSearchHistoryTable = pgTable("user_search_history", {
  userID: integer()
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  searchTerm: text().notNull(),
  totalSearchResults: integer().notNull(),
  searchResults: text().array(),
  searchTimestamp: timestamp().notNull().defaultNow(),
});

export const userProductFavoritesTable = pgTable("user_product_favorites", {
  userID: integer()
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  foodProductId: integer()
    .notNull()
    .references(() => foodProductsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  favoritedAt: timestamp().notNull().defaultNow(),
});

export const reportTypes = [
  "invalid_name_brand",
  "invalid_category",
  "invalid_nutrition",
  "invalid_image",
  "duplicate_product",
  "other",
  "resubmission",
] as const;
export const userReportTypes = pgEnum("user_report_types", reportTypes);
export const userReportStatus = pgEnum("user_report_status", ["pending", "resolved", "rejected"]);

export const userReportTable = pgTable("user_report", {
  reportID: serial().primaryKey(),
  userID: integer()
    .notNull()
    .default(-1)
    .references(() => usersTable.id, {
      onDelete: "set default",
      onUpdate: "set default",
    }),
  foodProductId: integer()
    .references(() => foodProductsTable.id, {
      onDelete: "set null",
      onUpdate: "set null",
    }),
  oldFoodProductId: integer()
    .references(() => foodProductsTable.id, {
      onDelete: "set null",
      onUpdate: "set null",
    }),

  reportType: userReportTypes().array(),
  reportDescription: text(),
  reportTimestamp: timestamp().notNull().defaultNow(),

  reportStatus: userReportStatus().notNull().default("pending"),
  adminComment: text(),
  closeAdmin: integer()
    .references(() => usersTable.id, {
      onDelete: "set null",
      onUpdate: "set null",
    }),
  closeTimestamp: timestamp(),
});
