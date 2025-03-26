import { Readable } from "stream";

export const fetchImageAsMulter = async (
  url: string
): Promise<Express.Multer.File | undefined> => {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const fileName = url.split("data/").pop()?.replace(/\//g, "-") || "image.jpg";

  return bufferToMulter(buffer, fileName, contentType);
};

export const bufferToMulter = (
  buffer: Buffer,
  fileName: string,
  contentType: string
): Express.Multer.File => {
  return {
    fieldname: "image",
    originalname: fileName,
    mimetype: contentType,
    buffer: buffer,
    size: buffer.length,
    destination: "",
    filename: "",
    path: "",
    stream: Readable.from([]),
    encoding: "utf-8",
  };
};

export const fetchImageAsBuffer = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
};
