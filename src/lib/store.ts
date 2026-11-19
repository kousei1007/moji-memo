import { get, set } from "idb-keyval";
import { PROVIDERS, type Provider } from "./ai/types";

/** updatedAt is 0 for the untouched default project, so sync can tell it apart from real work. */
export type Project = { id: string; name: string; kana: string; updatedAt: number };

export type MemoImage = { id: string; dataUrl: string };

/** A piece of text placed freely on the memo page (px from the page's top-left corner). */
export type TextBox = { id: string; x: number; y: number; body: string; kana: string; size?: number; color?: string };

/** Optional page arrangement. Memos without one look exactly as before. */
export type Layout = {
  /** Size (glyph height in px) and colour of the main text. */
  size?: number;
  color?: string;
  /** Extra texts started by double-clicking the page. */
  texts?: TextBox[];
  /** Position, width and rotation (degrees clockwise) of images the user has arranged, by image id. */
  images?: Record<string, { x: number; y: number; w: number; r?: number }>;
};

export type Memo = {
  id: string;
  projectId: string;
  /** What the user typed (kanji and all). */
  body: string;
  /** Hiragana reading of the body — this is what gets drawn. */
  kana: string;
  images: MemoImage[];
  summary?: { text: string; kana: string };
  layout?: Layout;
  updatedAt: number;
};

/** Record of a local deletion, kept until sync has told the server about it. */
export type Tombstone = { table: "projects" | "memos" | "memo_images"; id: string; at: number };

export type Data = { projects: Project[]; memos: Memo[]; tombstones: Tombstone[] };

const DATA_KEY = "memo-data-v1";
const AI_KEY = "memo-ai-settings-v1";

export const newId = () => crypto.randomUUID();

export async function loadData(): Promise<Data> {
  const data = await get<Data>(DATA_KEY).catch(() => undefined);
  if (data?.projects?.length) {
    return {
      projects: data.projects.map((p) => ({ ...p, updatedAt: p.updatedAt ?? 0 })),
      memos: data.memos ?? [],
      tombstones: data.tombstones ?? [],
    };
  }
  return { projects: [{ id: newId(), name: "メモ", kana: "めも", updatedAt: 0 }], memos: [], tombstones: [] };
}

export function saveData(data: Data): Promise<void> {
  return set(DATA_KEY, data);
}

export type AiSettings = {
  provider: Provider;
  keys: Record<Provider, string>;
  models: Record<Provider, string>;
};

export const defaultAiSettings = (): AiSettings => ({
  provider: "anthropic",
  keys: { anthropic: "", openai: "", gemini: "" },
  models: {
    anthropic: PROVIDERS.anthropic.defaultModel,
    openai: PROVIDERS.openai.defaultModel,
    gemini: PROVIDERS.gemini.defaultModel,
  },
});

/** API keys stay in this browser's localStorage; they are only sent along with a summarize request. */
export function loadAiSettings(): AiSettings {
  const base = defaultAiSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(AI_KEY) ?? "null") as Partial<AiSettings> | null;
    if (!saved) return base;
    return {
      provider: saved.provider && saved.provider in PROVIDERS ? saved.provider : base.provider,
      keys: { ...base.keys, ...saved.keys },
      models: { ...base.models, ...saved.models },
    };
  } catch {
    return base;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_KEY, JSON.stringify(settings));
}

/** Shrink an image file to a JPEG data URL that is cheap to store and to send to a vision model. */
export async function fileToDataUrl(file: File, maxSide = 1568): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Text added to the end of every new memo, like an e-mail signature. Kept per device. */
export type Signature = { text: string; kana: string };
const SIGNATURE_KEY = "memo-signature-v1";

export function loadSignature(): Signature {
  try {
    const saved = JSON.parse(localStorage.getItem(SIGNATURE_KEY) ?? "null") as Partial<Signature> | null;
    return { text: saved?.text ?? "", kana: saved?.kana ?? "" };
  } catch {
    return { text: "", kana: "" };
  }
}

export function saveSignature(signature: Signature): void {
  localStorage.setItem(SIGNATURE_KEY, JSON.stringify(signature));
}
