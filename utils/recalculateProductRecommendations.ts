import { listCategoryChildren } from "@/src/routes/category";
import { setCategoryProductScore } from "@/src/utils/recommendation";

(async () => {
  const categories = await listCategoryChildren();
  // const categories = { 42: "test" };
  for (const [key] of Object.entries(categories)) {
    const categoryID = Number(key);
    if (categoryID === 0) continue;
    const productScores = await setCategoryProductScore(categoryID);
    console.log(`Category ${key} - ${productScores?.size} products updated`);
  }
})();
