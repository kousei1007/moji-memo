export type Provider = "anthropic" | "openai" | "gemini";

export type ImageInput = {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Base64 without the data: prefix. */
  data: string;
};

export type SummarizeInput = {
  apiKey: string;
  model: string;
  text: string;
  images: ImageInput[];
};

/** An error whose message is safe and useful to show to the user. */
export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export const PROVIDERS: Record<Provider, { label: string; defaultModel: string; keyUrl: string; keyHint: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    defaultModel: "claude-opus-5-5",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyHint: "sk-ant-...",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-...",
  },
  gemini: {
    label: "Gemini (Google)",
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza...",
  },
};

export const SYSTEM_PROMPT = `あなたはメモ要約アシスタントです。ユーザーのメモ本文と添付画像の内容を、日本語で3〜5文に簡潔に要約します。

出力は次の形式だけにしてください。Markdownや前置きは書きません。
1. 通常の日本語（漢字かな交じり）の要約
2. 「---」だけの区切り行
3. 同じ要約を、すべてひらがなだけで書いたもの。漢字・カタカナ・英字・数字は文脈に合った読みのひらがなに直します。句読点「、」「。」と長音「ー」は使えます。`;

export function buildUserText(text: string, imageCount: number): string {
  const body = text.trim();
  if (!body) return "添付した画像の内容を要約してください。";
  const lead = imageCount > 0 ? "次のメモ本文と添付画像をあわせて要約してください。" : "次のメモを要約してください。";
  return `${lead}\n\n<memo>\n${body}\n</memo>`;
}

/** Split the model output into the plain summary and its hiragana version. */
export function splitSummary(output: string): { text: string; kana: string | null } {
  const parts = output.split(/^\s*-{3,}\s*$/m);
  if (parts.length < 2) return { text: output.trim(), kana: null };
  return { text: parts[0].trim(), kana: parts.slice(1).join("\n").trim() || null };
}
