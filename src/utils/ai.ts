import { GoogleGenAI, Part, Schema } from "@google/genai";

import { logger } from "./logger";

export const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API! });

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
  schema: Schema,
  maxOutputTokens: number = 512
): Promise<T | null> => {
  const result = await genAI.models.generateContent({
    model: model,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens: maxOutputTokens,
      thinkingConfig: model === "gemini-2.5-flash-preview-04-17" ? {
        thinkingBudget: 0,
      } : undefined,
      temperature: 0.2,
    },
    contents: [
      bufferToGenerativePart(buffer),
      prompt,
    ],
  });

  logger.info({
    message: "Tokens used",
    usage: {
      inputToken: result.usageMetadata?.promptTokenCount,
      outputToken: result.usageMetadata?.candidatesTokenCount,
    },
    model: model,
    prompt: prompt,
  });
  try {
    if (result.text === undefined) throw new Error("Empty response from model.");
    const parsedResult: T = JSON.parse(result.text);

    return parsedResult;
  } catch (error) {
    logger.error({
      message: "Error parsing result",
      error: error,
      model: model,
      prompt: prompt,
      result: result.text,
    });
    return null;
  }
};
