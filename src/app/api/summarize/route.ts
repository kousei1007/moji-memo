import { summarizeWithClaude } from "@/lib/ai/anthropic";
import { summarizeWithGemini, summarizeWithOpenAI } from "@/lib/ai/others";
import { AiError, PROVIDERS, splitSummary, type ImageInput, type Provider } from "@/lib/ai/types";
import { toHiragana } from "@/lib/kana";
import { toReading } from "@/lib/reading";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Body = { provider?: string; apiKey?: string; model?: string; text?: string; images?: ImageInput[] };

/**
 * Summarize a memo with the user's own API key.
 * The key is used for this single upstream call only: it is never stored or logged here.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return Response.json({ error: "不正なリクエストです。" }, { status: 400 });

  const provider = body.provider as Provider;
  if (!(provider in PROVIDERS)) return Response.json({ error: "未対応のAIです。" }, { status: 400 });
  const apiKey = body.apiKey?.trim();
  if (!apiKey) return Response.json({ error: "APIキーが設定されていません。" }, { status: 401 });

  const text = typeof body.text === "string" ? body.text : "";
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > 8 || images.some((i) => !MEDIA_TYPES.has(i?.mediaType) || typeof i?.data !== "string")) {
    return Response.json({ error: "画像は8枚まで、JPEG/PNG/WebP/GIFに対応しています。" }, { status: 400 });
  }
  if (!text.trim() && images.length === 0) {
    return Response.json({ error: "要約する内容がありません。" }, { status: 400 });
  }

  const input = { apiKey, model: body.model?.trim() || PROVIDERS[provider].defaultModel, text, images };
  try {
    const output =
      provider === "anthropic"
        ? await summarizeWithClaude(input)
        : provider === "openai"
          ? await summarizeWithOpenAI(input)
          : await summarizeWithGemini(input);
    const summary = splitSummary(output);
    // Trust the model's own hiragana when present; otherwise look the reading up.
    const kana = summary.kana ? await toReading(summary.kana) : await toReading(summary.text);
    return Response.json({ text: summary.text, kana: toHiragana(kana) });
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.status });
    console.error("summarize failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "要約中に予期しないエラーが発生しました。" }, { status: 500 });
  }
}
