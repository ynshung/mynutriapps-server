import { listCategoryChildren } from "@/src/routes/category";
import { setCategoryProductScore } from "@/src/utils/recommendation";

(async () => {
  const categories = await listCategoryChildren();
  // const categories = { 42: "test" };
  await Promise.all(
    Object.entries(categories).map(async ([key]) => {
      const categoryID = Number(key);
      if (categoryID === 0) return;
      const productScores = await setCategoryProductScore(categoryID);
      console.log(`Category ${key} - ${productScores?.size} products updated`);
    })
  );
})();
