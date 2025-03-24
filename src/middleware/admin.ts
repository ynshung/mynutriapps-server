import { Request, Response, NextFunction } from "express";
import { auth } from "../utils/firebase";

// Extend the Request interface to include the uid property
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const bearerToken = req.headers.authorization?.split("Bearer ")[1];

  if (bearerToken) {
    try {
      const decodedToken = await auth.verifyIdToken(bearerToken);

      // TODO: Fetch admin from db
      if (decodedToken.uid !== "dRblard7VFZIcVTD870NIQ07L633") {
        res.status(401).send("Unauthorized");
        return;
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
