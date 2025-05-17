import { db } from "@/src/db";
import { foodProductsTable } from "@/src/db/schema";
import { eq } from "drizzle-orm";

const removeDuplicateKeys = async () => {
  const selectableList = await db
    .select({
      id: foodProductsTable.id,
      allergens: foodProductsTable.allergens,
      additives: foodProductsTable.additives,
    })
    .from(foodProductsTable);

  selectableList.forEach(async (item) => {
    const uniqueAllergens = [...new Set(item.allergens)];
    const uniqueAdditives = [...new Set(item.additives)];

    await db
      .update(foodProductsTable)
      .set({
        allergens: uniqueAllergens,
        additives: uniqueAdditives,
      })
      .where(eq(foodProductsTable.id, item.id));
  });
};

removeDuplicateKeys();