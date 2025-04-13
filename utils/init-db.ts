import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "@src/db";
import { foodCategoryTable, usersTable } from "@src/db/schema";

const initializeDatabase = async () => {
  console.log("⏳ Initializing database...");
  const start = Date.now();

  // Add any new SQL commands below

  const filePath = resolve(__dirname, "../data/food_categories.tsv");
  const data = readFileSync(filePath, "utf-8");

  const lines = data.trim().split("\n");

  const categoriesMap: Map<string, string[]> = new Map();

  for (const line of lines) {
    const [mainCategory, subCategory] = line.split("\t");

    const subCategoryList = categoriesMap.get(mainCategory) || [];
    if (subCategory) subCategoryList.push(subCategory);

    categoriesMap.set(mainCategory, subCategoryList);
  }

  categoriesMap.forEach(async (subCategories, mainCategory) => {
    const mainCategoryRecord = await db
      .insert(foodCategoryTable)
      .values({
        name: mainCategory,
        isParentCategory: subCategories.length > 0,
      })
      .returning({ id: foodCategoryTable.id });

    if (subCategories.length === 0) return;

    await db.insert(foodCategoryTable).values(
      subCategories.map((subCategory) => ({
        name: subCategory,
        parentId: mainCategoryRecord[0].id,
      }))
    );
  });

  await db.insert(usersTable).values({
    name: "Anonymous",
    id: -1,
    email: "anonymous@ynshung.com",
    firebaseUUID: "anonymous-uuid",
  });

  await db.insert(usersTable).values({
    name: "Admin",
    id: 0,
    email: "admin@ynshung.com",
    firebaseUUID: "dRblard7VFZIcVTD870NIQ07L633",
  });

  // End of SQL commands
  const end = Date.now();
  console.log(
    `✅ Database initialized (${
      process.env.PROD_MODE ? "Production" : "Test"
    }) & took ${end - start}ms`
  );
  console.log("");
  process.exit(0);
};

initializeDatabase().catch((err) => {
  console.error("❌ Database initialization failed");
  console.error(err);
  process.exit(1);
});
