import { Request, Response, NextFunction } from "express";
import { auth } from "../utils/firebase";
import { db } from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

// Extend the Request interface to include the uid property
declare module "express-serve-static-core" {
  interface Request {
    firebaseUUID: string;
    email?: string;
    emailVerified?: boolean;
    userID?: number;
  }
}

// firebaseUID to userID mapping
const userIDMap: Record<string, number> = {};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const bearerToken = req.headers.authorization?.split("Bearer ")[1];

  if (bearerToken) {
    try {
      const decodedToken = await auth.verifyIdToken(bearerToken);

      // Attach uid to the request object
      req.firebaseUUID = decodedToken.uid;
      req.email = decodedToken.email;
      req.emailVerified = decodedToken.email_verified;

      // TODO: Fetch admin from db
      if (decodedToken.uid === "dRblard7VFZIcVTD870NIQ07L633") {
        req.userID = 0;
        return;
      }

      if (!req.email || !req.emailVerified) {
        res.status(403).json({
          status: "error",
          message: "Unverified account",
        });
        return;
      }

      // Check if the user exists in the database
      if (userIDMap[decodedToken.uid]) {
        req.userID = userIDMap[decodedToken.uid];
      } else {
        const user = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.firebaseUUID, decodedToken.uid));
  
        if (user.length >= 1) {
          req.userID = user[0].id;
          userIDMap[decodedToken.uid] = user[0].id;
        }
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401).send("Unauthorized");
    }
  } else {
    res.status(401).send("Unauthorized");
  }
};
