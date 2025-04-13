import { AnyPgColumn, boolean, date } from "drizzle-orm/pg-core";
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

export const goalEnum = pgEnum("goal", [
  "improveHealth",
  "loseWeight",
  "improvePerformance",
  "none",
]);

export const foodProductImageTypes = pgEnum("food_product_image_types", [
  "front",
  "nutritional_table",
  "ingredients",
  "other",
]);

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
});

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
});

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
