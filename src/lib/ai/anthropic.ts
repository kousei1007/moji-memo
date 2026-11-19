import Anthropic from "@anthropic-ai/sdk";
import { AiError, SYSTEM_PROMPT, buildUserText, type SummarizeInput } from "./types";

/** Models that accept the server-side refusal fallback parameter. */
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-2",
  "claude-fable-5-1",
]);

export async function summarizeWithClaude({ apiKey, model, text, images }: SummarizeInput): Promise<string> {
  const client = new Anthropic({ apiKey });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      }),
    ),
    { type: "text", text: buildUserText(text, images.length) },
  ];

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      // If a safety classifier declines the request, let the API retry it on a fallback model.
      ...(FALLBACK_MODELS.has(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new AiError("AIがこの内容の要約を辞退しました。", 422);
    }
    const out = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!out.trim()) throw new AiError("AIから要約が返りませんでした。");
    return out;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiError("APIキーが正しくありません。設定を確認してください。", 401);
    } else if (error instanceof Anthropic.PermissionDeniedError) {
      throw new AiError("このAPIキーでは指定のモデルを利用できません。", 403);
    } else if (error instanceof Anthropic.NotFoundError) {
      throw new AiError(`モデル「${model}」が見つかりません。`, 404);
    } else if (error instanceof Anthropic.RateLimitError) {
      throw new AiError("利用上限に達しました。少し待ってからもう一度お試しください。", 429);
    } else if (error instanceof Anthropic.BadRequestError) {
      throw new AiError(`リクエストが受け付けられませんでした: ${error.message}`, 400);
    } else if (error instanceof Anthropic.APIConnectionError) {
      throw new AiError("AIサービスに接続できませんでした。");
    } else if (error instanceof Anthropic.APIError) {
      throw new AiError(`AIサービスでエラーが発生しました (${error.status ?? "?"})。`);
    }
    throw error;
  }
}
