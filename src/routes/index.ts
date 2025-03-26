import { Router } from "express";
import { listProducts, createProduct, getProduct } from "./product";
import {
  addCategory,
  deleteCategory,
  listCategory,
  updateCategory,
} from "./category";
import { Request, Response, NextFunction } from "express";
import { upload } from "../middleware/upload";
import "express-async-errors";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { imagesTable, usersTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { adminMiddleware } from "../middleware/admin";
import { processFrontLabel } from "../ai/productFrontLabel";
import { processNutritionLabelV2 } from "../ai/productNutritionLabel";
import { processIngredientsLabel } from "../ai/productIngredients";
import {
  FoodIngredientDetails,
  FoodProduct,
  NutritionInfoFull,
} from "@/types/prompt";
import cors from "cors";
import { NewFoodProductFormData } from "@/types";
import {
  createNewProduct,
  editProductData,
  uploadProductImages,
} from "../utils/product";
import {
  bufferToMulter,
  fetchImageAsBuffer,
  fetchImageAsMulter,
} from "../utils/fetchImage";
import { uploadImage } from "../utils/image";
import sharp from "sharp";

const router = Router();

router.use(cors());

router.get("/status", (req, res) => {
  res.status(200);
});

// TODO: Apply authMiddleware to specific routes

// User Profile
router.use("/api/v1/user", authMiddleware);

// Retrieve user profile
// GET /api/v1/user/profile
// Body: None
router.get("/api/v1/user/profile", async (req, res) => {
  if (req.userID) {
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userID))
      .innerJoin(imagesTable, eq(usersTable.profilePicture, imagesTable.id));
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

router.post("/api/v1/user/onboarding", async (req, res) => {
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

router.post("/api/v1/user/edit-profile", async (req, res) => {
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

router.post("/api/v1/category", async (req, res) => {
  const { id, name } = req.body;
  const category = await addCategory(id, name);
  res.status(201).json(category);
});

router.put("/api/v1/category/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const category = await updateCategory(Number(id), name);
  res.status(200).json(category);
});

router.delete("/api/v1/category/:id", async (req, res) => {
  const { id } = req.params;
  await deleteCategory(Number(id));
  res.status(204).json();
});

// Food Products
router.get("/api/v1/list", listProducts);
router.get("/api/v1/product/:id", getProduct);
// router.get("/api/v1/product/:id/ingredients", getProductIngredients);

router.post(
  "/api/v1/product/create",
  upload.fields([
    { name: "front_label", maxCount: 1 },
    { name: "nutrition_label", maxCount: 1 },
    { name: "ingredients", maxCount: 1 },
  ]),
  async (req, res) => {
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

    const userID = parseInt(req.body.user_id);
    const barcode = req.body.barcode;

    if (!barcode) {
      res.status(400).json({
        status: "error",
        message: "Barcode is required",
      });
      return;
    }

    if (isNaN(userID)) {
      res.status(400).json({
        status: "error",
        message: "User UUID is required",
      });
      return;
    }

    const result = await createProduct(barcode, userID, {
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

const inferenceHandlers = {
  front_label: processFrontLabel,
  nutrition_label: processNutritionLabelV2,
  ingredients: processIngredientsLabel,
};

interface InferenceResult {
  frontLabelData?: FoodProduct;
  nutritionLabelData?: NutritionInfoFull;
  ingredientsLabelData?: FoodIngredientDetails;
}

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

    const tasks: Promise<InferenceResult>[] = [];

    if (frontLabel || (frontLabelUrl && frontLabelUrl.startsWith("http"))) {
      tasks.push(
        inferenceHandlers
          .front_label(
            frontLabel
              ? frontLabel.buffer
              : await fetchImageAsBuffer(frontLabelUrl)
          )
          .then((frontLabelData) => ({
            frontLabelData,
          }))
      );
    }
    if (
      nutritionLabel ||
      (nutritionLabelUrl && nutritionLabelUrl.startsWith("http"))
    ) {
      tasks.push(
        inferenceHandlers
          .nutrition_label(
            nutritionLabel
              ? nutritionLabel.buffer
              : await fetchImageAsBuffer(nutritionLabelUrl)
          )
          .then((nutritionLabelData) => ({
            nutritionLabelData,
          }))
      );
    }
    if (ingredients || (ingredientsUrl && ingredientsUrl.startsWith("http"))) {
      tasks.push(
        inferenceHandlers
          .ingredients(
            ingredients
              ? ingredients.buffer
              : await fetchImageAsBuffer(ingredientsUrl)
          )
          .then((ingredientsLabelData) => ({
            ingredientsLabelData,
          }))
      );
    }

    if (tasks.length === 0) {
      res.status(400).json({
        status: "error",
        message: "At least one image is required",
      });
      return;
    }

    try {
      const results = await Promise.allSettled(tasks);

      const fulfilledResults = results
        .filter((result) => result.status === "fulfilled")
        .map(
          (result) =>
            (
              result as PromiseFulfilledResult<
                InferenceResult & { imageID: string }
              >
            ).value
        );

      const reducedResult = fulfilledResults.reduce(
        (acc: InferenceResult, result) => {
          if (result.frontLabelData) {
            acc.frontLabelData = result.frontLabelData;
          }
          if (result.nutritionLabelData) {
            acc.nutritionLabelData = result.nutritionLabelData;
          }
          if (result.ingredientsLabelData) {
            acc.ingredientsLabelData = result.ingredientsLabelData;
          }
          return acc;
        },
        {}
      );

      const hasRejected = results.some(
        (result) => result.status === "rejected"
      );

      res.status(201).json({
        status: hasRejected ? "warning" : "success",
        data: reducedResult,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: "error",
        message: "Failed to process images",
      });
    }
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

// TODO; Fetch from URL (for batch processing)
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
      fetchImageAsMulter(frontLabel),
      fetchImageAsMulter(nutritionLabel),
      fetchImageAsMulter(ingredients),
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
