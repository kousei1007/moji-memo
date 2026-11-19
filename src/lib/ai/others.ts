import { AiError, SYSTEM_PROMPT, buildUserText, type SummarizeInput } from "./types";

function statusError(status: number, model: string, detail: string): AiError {
  if (status === 401 || status === 403) return new AiError("APIキーが正しくないか、権限がありません。", status);
  if (status === 404) return new AiError(`モデル「${model}」が見つかりません。設定でモデル名を確認してください。`, 404);
  if (status === 429) return new AiError("利用上限に達しました。少し待ってからもう一度お試しください。", 429);
  return new AiError(`AIサービスでエラーが発生しました (${status})。${detail.slice(0, 200)}`);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, model: string) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError("AIサービスに接続できませんでした。");
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw statusError(res.status, model, json?.error?.message ?? "");
  }
  return res.json();
}

/** OpenAI Chat Completions (text + image input). */
export async function summarizeWithOpenAI({ apiKey, model, text, images }: SummarizeInput): Promise<string> {
  const json = (await postJson(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserText(text, images.length) },
            ...images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mediaType};base64,${img.data}` },
            })),
          ],
        },
      ],
    },
    model,
  )) as { choices?: { message?: { content?: string | null } }[] };
  const out = json.choices?.[0]?.message?.content;
  if (!out?.trim()) throw new AiError("AIから要約が返りませんでした。");
  return out;
}

/** Google Gemini generateContent (text + image input). */
export async function summarizeWithGemini({ apiKey, model, text, images }: SummarizeInput): Promise<string> {
  const json = (await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": apiKey },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            ...images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } })),
            { text: buildUserText(text, images.length) },
          ],
        },
      ],
    },
    model,
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!out?.trim()) throw new AiError("AIから要約が返りませんでした。");
  return out;
}
