import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "@src/db";
import { foodCategoryTable, usersTable } from "@src/db/schema";

const initializeDatabase = async () => {
  console.log("⏳ Initializing database...");
  const start = Date.now();
  
  // Delete all rows
  await db.delete(foodCategoryTable);

  const foodCategories = readFileSync(resolve(__dirname, "../data/food_categories.tsv"), "utf-8")
    .split("\n")
    .map((line) => line.split("\t"))
    .map(([code, subcategory]) => ({
      id: Number(code),
      name: subcategory,
      alias: [subcategory],
    }))
    .slice(1); // Skip the header
  
  await db.insert(foodCategoryTable).values(foodCategories);

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

  const end = Date.now();
  console.log(`✅ Database initialized (${process.env.PROD_MODE ? "Production" : "Test"}) & took ${end - start}ms`);
  console.log("");
  process.exit(0);
}

initializeDatabase().catch((err) => {
  console.error("❌ Database initialization failed");
  console.error(err);
  process.exit(1);
});
