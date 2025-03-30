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
): Promise<T | null> => {
  const modelInstance = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens: 256,
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
  try {
    const parsedResult: T = JSON.parse(result.response.text());
    
    return parsedResult;
  } catch (error) {
    logger.error({
      message: "Error parsing result",
      error: error,
      model: model,
      prompt: prompt,
      result: result.response.text(),
    });
    return null;
  }
};
