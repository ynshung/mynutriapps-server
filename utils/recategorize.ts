import { processFrontLabel } from "@/src/ai/productFrontLabel";
import { db } from "@/src/db";
import {
  foodCategoryTable,
  foodProductsTable,
  imageFoodProductsTable,
  imagesTable,
} from "@/src/db/schema";
import { and, eq } from "drizzle-orm";

const recategorize = async (categoryID: number = 0) => {
  const categoryItems = await db
    .select({
      id: foodProductsTable.id,
      imageKey: imagesTable.imageKey,
    })
    .from(foodProductsTable)
    .innerJoin(
      imageFoodProductsTable,
      eq(foodProductsTable.id, imageFoodProductsTable.foodProductId)
    )
    .innerJoin(imagesTable, eq(imageFoodProductsTable.imageId, imagesTable.id))
    .where(
      and(
        eq(foodProductsTable.foodCategoryId, categoryID),
        eq(imageFoodProductsTable.type, "front")
      )
    );

  for (const item of categoryItems) {
    const imageKey = item.imageKey;
    const foodProductID = item.id;
    let newCategoryID = 0;

    const image = await fetch(
      `https://mna-sg.s3.ap-southeast-1.amazonaws.com/${imageKey}`
    );
    const imageArrayBuffer = await image.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);

    const frontLabelData = await processFrontLabel(imageBuffer);

    if (!frontLabelData)
      throw new Error("Front label data couldn't be processed");
    if (!frontLabelData.category) frontLabelData.category = "Uncategorized";
    const categoryQueryResult = await db
      .select()
      .from(foodCategoryTable)
      .where(eq(foodCategoryTable.name, frontLabelData.category));
    if (categoryQueryResult.length === 0) {
      throw new Error("Unexpected error: Category not found");
    } else {
      newCategoryID = categoryQueryResult[0].id;
    }
    const newProductValues = {
      name: frontLabelData.name,
      brand: frontLabelData.brand,
      foodCategoryId: newCategoryID ?? 0, // Uncategorized if undefined
    };

    if (categoryID !== newCategoryID) {
      await db
        .update(foodProductsTable)
        .set(newProductValues)
        .where(eq(foodProductsTable.id, foodProductID));
  
      console.log(
        `\u001b[1;32mRecategorized ${item.id} ${frontLabelData.name} (${frontLabelData.brand}) to ${frontLabelData.category}\u001b[0m`
      );
    }
    // await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

recategorize(84)
