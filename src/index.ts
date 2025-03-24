import express from "express";
import dotenv from "dotenv";
import router from "./routes";

dotenv.config();

const PORT = parseInt(process.env.PORT!);

const app = express();

app.use(express.json());
app.use(router);

const startServer = (host: string) => {
  app.listen(PORT, host, () => {
    console.log(`Server running at ${host}:${PORT}`);
  }).on("error", (error) => {
    console.error(error);
  });
};

startServer('127.0.0.1');
startServer('192.168.1.16');
