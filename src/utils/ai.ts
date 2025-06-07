import { GoogleGenAI, Part, Schema } from "@google/genai";

import { logger } from "./logger";
import OpenAI from "openai";
import { ResponseFormatTextConfig } from "openai/resources/responses/responses";

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
      thinkingConfig:
        model === "gemini-2.5-flash-preview-04-17"
          ? {
              thinkingBudget: 0,
            }
          : undefined,
    },
    contents: [bufferToGenerativePart(buffer), prompt],
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
    if (result.text === undefined)
      throw new Error("Empty response from model.");
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

export const generateDataOpenAI = async <T>(
  model: string,
  buffer: Buffer<ArrayBufferLike>,
  prompt: string,
  schema: ResponseFormatTextConfig,
  detail: "auto" | "low" | "high" = "auto"
): Promise<T | null> => {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const result = await openai.responses.parse({
      model: model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
              detail: detail,
            },
          ],
        },
      ],
      text: {
        format: schema,
      },
    });

    logger.info({
      message: "Tokens used",
      usage: {
        inputToken: result.usage?.input_tokens,
        outputToken: result.usage?.output_tokens,
      },
      model: model,
      prompt: prompt,
    });
    if (result.output_text === undefined)
      throw new Error("Empty response from model.");
    const parsedResult: T = result.output_parsed as T;

    return parsedResult;
  } catch (error) {
    logger.error({
      message: "Error in generateDataOpenAI",
      error: error,
      model: model,
      prompt: prompt,
    });
    console.error("Error in generateDataOpenAI:", error);
    return null;
  }
};
