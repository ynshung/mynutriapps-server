import { Router } from "express";
import {
  listProducts,
  createProduct,
  getProduct,
  listRecentlyViewedProducts,
  listFavoriteProducts,
  searchBarcode,
  searchProducts,
  searchSuggestions,
  listPopularProducts,
  productsQuery,
} from "./product";
import {
  getCategoryDetails,
  listCategory,
  listProductsCategory,
} from "./category";
import { Request, Response, NextFunction } from "express";
import { upload } from "../middleware/upload";
import "express-async-errors";
import {
  authMiddleware,
  optionalAuthMiddleware,
  userAuthMiddleware,
} from "../middleware/auth";
import { db } from "../db";
import {
  foodProductsTable,
  imagesTable,
  userProductFavoritesTable,
  usersTable,
} from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { adminMiddleware } from "../middleware/admin";
import cors from "cors";
import { NewFoodProductFormData } from "@/types";
import {
  createNewProduct,
  editProductData,
  getProductCard,
  uploadProductImages,
} from "../utils/product";
import { bufferToMulter, fetchImageAsMulter } from "../utils/fetchImage";
import { uploadImage } from "../utils/image";
import sharp from "sharp";
import { adminInferenceProduct } from "./admin";
import { findSimilarFoodProduct } from "../utils/frontImageVector";
import { getHistoryRecommendation } from "../utils/recommendation";

const router = Router();

router.use(cors());

router.get("/status", (req, res) => {
  res.status(200).json({
    status: "success",
  });
});

// User Profile

// Retrieve user profile
// GET /api/v1/user/profile
// Body: None
router.get("/api/v1/user/profile", userAuthMiddleware, async (req, res) => {
  if (req.userID) {
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userID))
      .leftJoin(imagesTable, eq(usersTable.profilePicture, imagesTable.id));

    if (user.length === 0) {
      res.status(404).json({
        status: "no_profile",
      });
      return;
    }
    res.status(200).json({
      status: "success",
      data: user[0],
    });
  } else {
    res.status(404).json({
      status: "no_profile",
    });
  }
});

router.post("/api/v1/user/onboarding", userAuthMiddleware, async (req, res) => {
  const { firebaseUUID, email, emailVerified, body } = req;
  if (!email || !emailVerified) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }

  const newUser: typeof usersTable.$inferInsert = {
    email,
    firebaseUUID,
    name: body.name,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    height: body.height,
    weight: body.weight,
    activityLevel: body.activityLevel,
    goal: body.goal,
    allergies: body.allergies,
    medicalConditions: body.medicalConditions,
  };

  const user = await db
    .insert(usersTable)
    .values(newUser)
    .returning({ id: usersTable.id });

  res.status(201).json({
    status: "success",
    data: {
      userID: user[0].id,
    },
  });
});

router.post(
  "/api/v1/user/profile-picture",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const { file } = req;
    if (!req.userID) {
      res.status(403).json({
        status: "error",
        message: "Invalid account",
      });
      return;
    }
    if (!file) {
      res.status(400).json({
        status: "error",
        message: "Image is required",
      });
      return;
    }

    const resizedImage = await sharp(file.buffer)
      .resize(400, 400)
      .jpeg({ quality: 50 })
      .toBuffer();

    const profilePicture = await uploadImage(
      bufferToMulter(resizedImage, file.originalname, file.mimetype),
      req.userID,
      false
    );

    await db
      .update(usersTable)
      .set({ profilePicture: profilePicture.imageID, updatedAt: new Date() })
      .where(eq(usersTable.id, req.userID));

    res.status(200).json({
      status: "success",
      message: "Image uploaded successfully",
      data: {
        key: profilePicture.imageKey,
        id: profilePicture.imageID,
      },
    });
  }
);

router.post("/api/v1/user/edit-profile", authMiddleware, async (req, res) => {
  const { userID, email, emailVerified, body } = req;
  if (!email || !emailVerified || !userID) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }

  await db
    .update(usersTable)
    .set({
      name: body.name,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      height: body.height,
      weight: body.weight,
      activityLevel: body.activityLevel,
      goal: body.goal,
      allergies: body.allergies,
      medicalConditions: body.medicalConditions,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userID));

  res.status(200).json({
    status: "success",
  });
});

// Food Categories

router.get("/api/v1/category", async (req, res) => {
  const categories = await listCategory();
  res.status(200).json(categories);
});

router.get("/api/v1/category/:id", optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;

  const productCategory = await listProductsCategory(
    Number(id),
    userID,
    Number(page),
    Number(limit)
  );
  res.status(200).json({
    category: await getCategoryDetails(Number(id)),
    products: productCategory,
  });
});

// Food Products
router.get("/api/v1/list", optionalAuthMiddleware, listProducts);
router.get("/api/v1/product/:id", optionalAuthMiddleware, getProduct);
router.get(
  "/api/v1/product/similar/:id",
  optionalAuthMiddleware,
  async (req, res) => {
    const { id } = req.params;
    const { userID } = req;
    const similarProducts = await findSimilarFoodProduct(Number(id));
    if (!similarProducts) {
      res.status(200).json([]);
      return;
    }
    const data = await Promise.all(
      similarProducts.map(async (item) => {
        const { id, similarity } = item;
        const product = await getProductCard(Number(id), userID);
        return { id, similarity, product };
      })
    );
    res.status(200).json(data);
  }
);
router.get("/api/v1/user/recommendation", authMiddleware, async (req, res) => {
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;
  if (!userID) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }
  const recommendations = await getHistoryRecommendation(userID);
  if (!recommendations) {
    res.status(200).json([]);
    return;
  }

  const data = await productsQuery({userID})
    .where(
      inArray(foodProductsTable.id, recommendations.map((item) => item.id))
    )
    .orderBy(sql`ARRAY_POSITION(ARRAY[${sql.join(recommendations.map((item) => item.id), sql`, `)}]::INTEGER[], ${foodProductsTable.id})`)
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit));

  res.status(200).json(data);
});

router.get("/api/v1/search-barcode", optionalAuthMiddleware, searchBarcode);

router.get("/api/v1/search", optionalAuthMiddleware, searchProducts);
router.get("/api/v1/suggestions", searchSuggestions);

/// Favorites
router.get("/api/v1/favorite", authMiddleware, async (req, res) => {
  const { userID } = req;

  if (!userID) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }

  try {
    const favorites = await listFavoriteProducts(userID);

    res.status(200).json({
      status: "success",
      data: favorites,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve favorite products",
    });
  }
});

router.post("/api/v1/favorite", authMiddleware, async (req, res) => {
  const { userID } = req;
  const { productID } = req.body;

  if (!userID) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }

  if (!productID) {
    res.status(400).json({
      status: "error",
      message: "Product ID is required",
    });
    return;
  }

  try {
    const existingFavorite = await db
      .select()
      .from(userProductFavoritesTable)
      .where(
        and(
          eq(userProductFavoritesTable.foodProductId, Number(productID)),
          eq(userProductFavoritesTable.userID, Number(userID))
        )
      );

    if (existingFavorite.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Product is already in favorites",
      });
      return;
    }

    await db.insert(userProductFavoritesTable).values({
      foodProductId: Number(productID),
      userID: Number(userID),
    });
    res.status(201).json({
      status: "success",
      message: "Product added to favorites",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Failed to add product to favorites",
    });
  }
});
router.delete("/api/v1/favorite", authMiddleware, async (req, res) => {
  const { userID } = req;
  const { productID } = req.body;

  if (!userID) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }

  if (!productID) {
    res.status(400).json({
      status: "error",
      message: "Product ID is required",
    });
    return;
  }

  try {
    await db
      .delete(userProductFavoritesTable)
      .where(
        and(
          eq(userProductFavoritesTable.foodProductId, Number(productID)),
          eq(userProductFavoritesTable.userID, Number(userID))
        )
      );
    res.status(200).json({
      status: "success",
      message: "Product removed from favorites",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Failed to remove product from favorites",
    });
  }
});
router.get("/api/v1/recently-viewed", authMiddleware, async (req, res) => {
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;

  if (!userID) {
    res.status(403).json({
      status: "error",
      message: "Invalid account",
    });
    return;
  }

  const recentlyViewedProducts = await listRecentlyViewedProducts(
    userID,
    Number(page),
    Number(limit)
  );
  res.status(200).json(recentlyViewedProducts);
});

router.get("/api/v1/popular", optionalAuthMiddleware, async (req, res) => {
  const { userID } = req;
  const { page = 1, limit = 10 } = req.query;

  const recentlyViewedProducts = await listPopularProducts(
    Number(page),
    Number(limit),
    userID
  );
  res.status(200).json(recentlyViewedProducts);
});

// TODO: auth middleware
router.post(
  "/api/v1/product/create",
  authMiddleware,
  upload.fields([
    { name: "front_label", maxCount: 1 },
    { name: "nutrition_label", maxCount: 1 },
    { name: "ingredients", maxCount: 1 },
  ]),
  async (req, res) => {
    const { userID } = req;
    const images = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    if (!images || Object.keys(images).length === 0) {
      res.status(400).json({
        status: "error",
        message: "Images are required",
      });
      return;
    }

    const frontLabel = images["front_label"][0];
    const nutritionLabel = images["nutrition_label"][0];
    const ingredients = images["ingredients"][0];

    const barcode = req.body.barcode;

    if (!barcode) {
      res.status(400).json({
        status: "error",
        message: "Barcode is required",
      });
      return;
    }

    const result = await createProduct(barcode, userID ?? 0, {
      frontLabel,
      nutritionLabel,
      ingredients,
    });
    res.status(201).json(result);
  }
);

// Admin
router.use("/api/v1/admin", adminMiddleware);
router.get("/api/v1/admin", (req, res) => {
  res.status(200).json({
    status: "success",
  });
});

router.post(
  "/api/v1/admin/product/inference",
  upload.fields([
    { name: "front_label", maxCount: 1 },
    { name: "nutrition_label", maxCount: 1 },
    { name: "ingredients", maxCount: 1 },
  ]),
  async (req, res) => {
    if (req.files === undefined) {
      res.status(400).json({
        status: "error",
        message: "Images are required",
      });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const frontLabel = files["front_label"]?.[0];
    const nutritionLabel = files["nutrition_label"]?.[0];
    const ingredients = files["ingredients"]?.[0];

    const frontLabelUrl = req.body.front_label_url;
    const nutritionLabelUrl = req.body.nutrition_label_url;
    const ingredientsUrl = req.body.ingredients_url;

    await adminInferenceProduct({
      frontLabel: frontLabel,
      nutritionLabel: nutritionLabel,
      ingredients: ingredients,
      frontLabelUrl: frontLabelUrl,
      nutritionLabelUrl: nutritionLabelUrl,
      ingredientsUrl: ingredientsUrl,
      res,
    });
  }
);

router.post(
  "/api/v1/admin/product/submit",
  upload.fields([
    { name: "front_label", maxCount: 1 },
    { name: "nutrition_label", maxCount: 1 },
    { name: "ingredients", maxCount: 1 },
  ]),
  async (req, res) => {
    const images = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const nutritionInfo = req.body as NewFoodProductFormData;
    const newProductID = await createNewProduct(nutritionInfo);

    if (images && Object.keys(images).length > 0) {
      await uploadProductImages(
        newProductID,
        {
          frontLabelImage: images.front_label?.[0],
          nutritionLabelImage: images.nutrition_label?.[0],
          ingredientsImage: images.ingredients?.[0],
        },
        0
      );
    }

    res.status(201).json({
      status: "success",
      data: {
        foodProductId: newProductID,
      },
    });
  }
);

router.post("/api/v1/admin/product/create-from-url", async (req, res) => {
  const { frontLabel, nutritionLabel, ingredients, barcode } = req.body;

  if (!barcode) {
    res.status(400).json({
      status: "error",
      message: "Barcode is required",
    });
    return;
  }

  const [frontLabelFile, nutritionLabelFile, ingredientsFile] =
    await Promise.all([
      frontLabel ? fetchImageAsMulter(frontLabel) : undefined,
      nutritionLabel ? fetchImageAsMulter(nutritionLabel) : undefined,
      ingredients ? fetchImageAsMulter(ingredients) : undefined,
    ]);

  if (frontLabelFile === undefined) {
    res.status(400).json({
      status: "error",
      message: "Front label image is required",
    });
    return;
  }

  const result = await createProduct(barcode, 0, {
    frontLabel: frontLabelFile,
    nutritionLabel: nutritionLabelFile,
    ingredients: ingredientsFile,
  });
  res.status(201).json(result);
});

router.post(
  "/api/v1/admin/product/edit/:productID",
  upload.fields([
    { name: "front_label", maxCount: 1 },
    { name: "nutrition_label", maxCount: 1 },
    { name: "ingredients", maxCount: 1 },
  ]),
  async (req, res) => {
    const images = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const productID = parseInt(req.params.productID);
    const nutritionInfo = req.body as NewFoodProductFormData;

    await editProductData(productID, nutritionInfo);

    if (images && Object.keys(images).length > 0) {
      await uploadProductImages(
        productID,
        {
          frontLabelImage: images.front_label?.[0],
          nutritionLabelImage: images.nutrition_label?.[0],
          ingredientsImage: images.ingredients?.[0],
        },
        0
      );
    }

    res.status(200).json({
      status: "success",
    });
  }
);

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    name: err.name,
    message: err.message,
  });
  next();
});

export default router;
