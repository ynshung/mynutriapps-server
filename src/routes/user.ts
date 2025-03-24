import { db } from "../db";
import { usersTable } from "../db/schema";

export const newProfile = async (email: string, firebaseUUID: string) => {
  const user = await db
    .insert(usersTable)
    .values({ email, firebaseUUID })
    .returning();
  return user[0].id;
}