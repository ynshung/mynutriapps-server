import { db } from "@/src/db";
import { imageFoodProductsTable, imagesTable } from "@/src/db/schema";
import { and, desc, eq } from "drizzle-orm";

const removeDuplicateImages = async () => {
  const data = await db
    .select({
      id: imagesTable.id,
      imageKey: imagesTable.imageKey,
      foodProductId: imageFoodProductsTable.foodProductId,
      imageType: imageFoodProductsTable.type,
    })
    .from(imageFoodProductsTable)
    .innerJoin(imagesTable, eq(imagesTable.id, imageFoodProductsTable.imageId))
    .orderBy(desc(imageFoodProductsTable.foodProductId));

  const seenCombinations = new Set<string>();
  const duplicates = [];

  for (const item of data) {
    const combinationKey = `${item.foodProductId}-${item.imageType}`;
    if (seenCombinations.has(combinationKey)) {
      duplicates.push(item);
    } else {
      seenCombinations.add(combinationKey);
    }
  }

  console.log("Duplicates found:", duplicates.length);

  for (const duplicate of duplicates) {
    await db
      .delete(imageFoodProductsTable)
      .where(
        and(
          eq(imageFoodProductsTable.imageId, duplicate.id),
          eq(imageFoodProductsTable.foodProductId, duplicate.foodProductId),
          eq(imageFoodProductsTable.type, duplicate.imageType)
        )
      );
  }
};

removeDuplicateImages();
