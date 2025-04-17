import express from "express";
import dotenv from "dotenv";
import router from "./routes";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "3000");

const app = express();

app.use(express.json());
app.use(router);

app
  .listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at 0.0.0.0:${PORT}`);
  })
  .on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
