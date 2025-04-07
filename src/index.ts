import express from "express";
import dotenv from "dotenv";
import router from "./routes";
import os from "os";

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
const getCurrentIP = (): string => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  throw new Error("Unable to determine current IP address");
};

startServer(getCurrentIP());
