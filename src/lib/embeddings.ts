import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Generate 768-dimensional text embedding using Gemini text-embedding-004 (D-01).
 * Returns null if API key is missing, API fails, or returned dimension is not 768.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Embeddings] Neither GOOGLE_API_KEY nor GEMINI_API_KEY is configured. Falling back to ILIKE.");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "models/text-embedding-004" });
    const result = await model.embedContent(text);
    const values = result.embedding?.values;
    if (Array.isArray(values) && values.length === 768) {
      return values;
    }
    console.warn(`[Embeddings] Unexpected embedding dimension: ${values ? values.length : 0} (expected 768)`);
    return null;
  } catch (err: any) {
    console.warn(`[Embeddings] Gemini embedding call failed: ${err?.message || err}. Falling back to ILIKE.`);
    return null;
  }
}

export const generateQueryEmbedding = generateEmbedding;
