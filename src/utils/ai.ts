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
  buffer: Buffer<ArrayBufferLike>,
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
    bufferToGenerativePart(buffer),
    prompt,
  ]);

  logger.info({
    message: "Tokens used",
    usage: {
      inputToken: result.response.usageMetadata?.promptTokenCount,
      outputToken: result.response.usageMetadata?.candidatesTokenCount,
    },
    model: model,
    prompt: prompt,
  });

  return JSON.parse(result.response.text()) as T;
};
