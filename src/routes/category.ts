import { eq } from "drizzle-orm";
import { foodCategoryTable } from "../db/schema";
import { db } from "../../src/db";

export const listCategory = async () => {
  const categories = await db.select().from(foodCategoryTable).orderBy(foodCategoryTable.id);
  return categories.reduce((acc, category) => {
    acc[category.id] = category.name;
    return acc;
  }, {} as Record<number, string>);
};

export const getCategory = async (id: number) => {
  const category = await db.select().from(foodCategoryTable).where(eq(foodCategoryTable.id, id));
  return category[0];
}

export const addCategory = async (id: number, name: string) => {
  const category = await db.insert(foodCategoryTable).values({ id, name }).returning();
  return category[0];
};

export const updateCategory = async (id: number, name: string) => {
  const category = await db.update(foodCategoryTable).set({ name }).where(eq(foodCategoryTable.id, id)).returning();
  return category;
};

export const deleteCategory = async (id: number) => {
  const category = await db.delete(foodCategoryTable).where(eq(foodCategoryTable.id, id)).returning();
  return category;
};