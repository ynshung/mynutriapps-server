import { GoogleGenerativeAI, Part, Schema } from "@google/generative-ai";
import { logger } from "./logger";

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API!);

export function bufferToGenerativePart(buffer: Buffer): Part {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: "image/jpeg",
    },
  };
}

export const generateData = async <T>(
  model: string,
  file: Express.Multer.File,
  prompt: string,
  schema: Schema
): Promise<T> => {
  const modelInstance = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const result = await modelInstance.generateContent([
    bufferToGenerativePart(file.buffer),
    prompt,
  ]);

  logger.info({
    message: "Tokens used",
    totalTokenCount: result.response.usageMetadata?.totalTokenCount ?? 0,
    model: model,
    prompt: prompt,
  });

  return JSON.parse(result.response.text()) as T;
};
