const LATIN: Record<string, string> = {
  a: "えー", b: "びー", c: "しー", d: "でぃー", e: "いー", f: "えふ", g: "じー",
  h: "えいち", i: "あい", j: "じぇー", k: "けー", l: "える", m: "えむ", n: "えぬ",
  o: "おー", p: "ぴー", q: "きゅー", r: "あーる", s: "えす", t: "てぃー", u: "ゆー",
  v: "ぶい", w: "だぶりゅー", x: "えっくす", y: "わい", z: "ぜっと",
};
const DIGITS = ["ぜろ", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];

/** True when the text contains characters whose reading needs a dictionary lookup. */
export function hasKanji(text: string): boolean {
  return /[㐀-鿿豈-﫿々〆]/.test(text);
}

/** Katakana, Latin letters and digits → hiragana. Kanji are left untouched. */
export function toHiragana(text: string, latin = false): string {
  return text
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[A-Za-z]/g, (c) => (latin ? c : LATIN[c.toLowerCase()]))
    .replace(/[0-9]/g, (c) => (latin ? c : DIGITS[Number(c)]));
}

/** Resolve the hiragana reading of arbitrary Japanese text (server lookup only when kanji are present). */
export async function fetchKana(text: string): Promise<string> {
  const latin = keepLatin();
  if (!hasKanji(text)) return toHiragana(text, latin);
  try {
    const res = await fetch("/api/kana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: [text], keepLatin: latin }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { kana: string[] };
    return json.kana[0];
  } catch {
    return toHiragana(text, latin);
  }
}

const KEEP_LATIN_KEY = "memo-keep-latin-v1";

/** Browser-side preference: draw A–Z and 0–9 as themselves instead of their reading. */
export function keepLatin(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(KEEP_LATIN_KEY) === "1";
}

export function setKeepLatin(on: boolean): void {
  window.localStorage.setItem(KEEP_LATIN_KEY, on ? "1" : "0");
}
