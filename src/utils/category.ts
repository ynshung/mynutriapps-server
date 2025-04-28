import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "../db";
import { foodCategoryTable } from "../db/schema";
import { eq } from "drizzle-orm";

export async function getCategoryIdByName(
  categoryName: string,
  tx: NodePgDatabase = db,
): Promise<number> {
  const categoryQueryResult = await tx
    .select()
    .from(foodCategoryTable)
    .where(eq(foodCategoryTable.name, categoryName));

  if (categoryQueryResult.length === 0) {
    throw new Error("Unexpected error: Category not found");
  }

  return categoryQueryResult[0].id;
}
