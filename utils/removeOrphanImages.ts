import { db } from "@/src/db";
import {
  foodCategoryTable,
  imageFoodProductsTable,
  imagesTable,
  usersTable,
} from "@/src/db/schema";
import { s3 } from "@/src/utils/s3";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray, isNull } from "drizzle-orm";

const removeOrphanImages = async () => {
  const orphanImages = await db
    .select({
      id: imagesTable.id,
      imageKey: imagesTable.imageKey,
    })
    .from(imagesTable)
    .leftJoin(foodCategoryTable, eq(imagesTable.id, foodCategoryTable.image))
    .leftJoin(
      imageFoodProductsTable,
      eq(imagesTable.id, imageFoodProductsTable.imageId)
    )
    .leftJoin(usersTable, eq(imagesTable.id, usersTable.profilePicture))
    .where(
      and(
        isNull(foodCategoryTable.image),
        isNull(imageFoodProductsTable.imageId),
        isNull(usersTable.profilePicture)
      )
    );
  
  if (orphanImages.length === 0) {
    console.log("No orphan images found.");
    return;
  }
  
  console.log(
    `Found ${orphanImages.length} orphan images. Proceeding to delete them...`
  );

  const command = new DeleteObjectsCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Delete: {
      Objects: orphanImages.map((image) => ({
        Key: image.imageKey,
      })),
    },
  });

  try {
    await s3.send(command);
    console.log("Successfully deleted orphan images from S3");

    await db.delete(imagesTable).where(
      inArray(
        imagesTable.id,
        orphanImages.map((image) => image.id)
      )
    );
  } catch (error) {
    console.error("Error deleting orphan images from S3:", error);
  }
  
};

removeOrphanImages();
