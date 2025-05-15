import { Request, Response, NextFunction } from "express";
import { auth } from "../utils/firebase";
import { db } from "../db";
import { GoalType, usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

// Extend the Request interface to include the uid property
declare module "express-serve-static-core" {
  interface Request {
    firebaseUUID: string;
    email?: string;
    emailVerified?: boolean;
    userID?: number;
    userGoal?: GoalType;
  }
}

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

      const user = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.firebaseUUID, decodedToken.uid));

      if (user.length >= 1) {
        req.userID = user[0].id;
      } else {
        res.status(404).json({
          status: "error",
          message: "User profile not found",
        });
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

// Middleware that requires token but does not require user to have a profile
export const userAuthMiddleware = async (
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
      const user = await db
        .select({ id: usersTable.id, goal: usersTable.goal })
        .from(usersTable)
        .where(eq(usersTable.firebaseUUID, decodedToken.uid));

      if (user.length >= 1) {
        req.userID = user[0].id;
        req.userGoal = user[0].goal ?? undefined;
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

export const optionalAuthMiddleware = async (
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
        return next();
      }

      if (req.email && req.emailVerified) {
        // Check if the user exists in the database
        const user = await db
          .select({ id: usersTable.id, goal: usersTable.goal })
          .from(usersTable)
          .where(eq(usersTable.firebaseUUID, decodedToken.uid));

        if (user.length >= 1) {
          req.userID = user[0].id;
          req.userGoal = user[0].goal ?? undefined;
        }
      }
    } catch (error) {
      console.warn("Optional auth middleware error:", error);
      // Do not block the request, just proceed without attaching user info
    }
  }

  next();
};
