/**
 * Glyph set for the fictional syllabary, drawn as vector strokes on a 100x100 grid.
 * One glyph per basic hiragana; voiced marks, small kana and katakana are derived at render time.
 * To correct a shape, edit its entry here — everything else picks it up.
 */
export type Glyph = {
  /** Stroked path data. */
  d?: string;
  /** Filled dots: [cx, cy, r]. */
  dots?: [number, number, number][];
  /** Stroked circles: [cx, cy, r]. */
  rings?: [number, number, number][];
};

export const GLYPHS: Record<string, Glyph> = {
  // a
  あ: { d: "M20 15 L50 88 L80 15 M31 42 H69" },
  か: { d: "M15 80 H85 M20 22 L50 80 L80 22" },
  さ: { d: "M20 84 V35 A15 15 0 0 1 50 35 V65 A15 15 0 0 0 80 65 V16" },
  た: { d: "M50 15 V80 M15 80 H85" },
  な: { d: "M18 22 H82 L18 80 H84" },
  は: { d: "M18 20 H82 M18 80 H82 M50 20 V80" },
  ま: { d: "M18 20 H82 L22 50 L82 80 H18" },
  や: { d: "M20 18 L52 50 L20 82 M52 50 H86" },
  ら: { d: "M72 15 V80 H15" },
  わ: { d: "M14 86 L36 16 L58 86 M42 86 L64 16 L86 86" },
  // i
  い: { dots: [[50, 52, 14]] },
  き: { d: "M38 16 V86", dots: [[54, 55, 14]] },
  し: { d: "M20 20 H80 M20 40 H80", dots: [[50, 72, 15]] },
  ち: { d: "M50 14 V62 M20 38 H80", dots: [[50, 74, 15]] },
  に: { d: "M24 16 H76 M15 86 H85", dots: [[50, 50, 14]] },
  ひ: { d: "M22 15 V82 H86", dots: [[60, 38, 15]] },
  み: { d: "M25 50 V88 M50 50 V88 M75 50 V88", dots: [[50, 22, 13]] },
  ゆ: { d: "M22 18 H50 V42 M22 88 V68 A28 26 0 0 1 78 68 V88" },
  り: { d: "M38 62 L18 88 M62 62 L82 88", dots: [[50, 32, 20]] },
  // u
  う: { d: "M22 88 V46 A28 28 0 0 1 78 46 V88" },
  く: { d: "M20 15 V74 A10 10 0 0 0 40 74 V15 M40 54 L80 20 M40 54 L82 88" },
  す: { d: "M18 20 H42 Q58 20 64 38 L86 88 M18 80 H44 Q62 80 63 58 V40" },
  つ: { d: "M20 15 V58 A30 30 0 0 0 80 58 V15 M40 15 V58 M60 15 V58" },
  ぬ: { d: "M22 88 V42 A28 28 0 0 1 78 42 V88 L30 22" },
  ふ: { d: "M18 22 H52 A29 29 0 0 1 52 80 H18" },
  む: { d: "M46 15 L18 78 H66 M52 48 V64 A14 14 0 0 0 80 64 V42" },
  よ: { d: "M50 50 V88", rings: [[50, 32, 18]] },
  る: { d: "M32 15 V58 Q32 80 14 86 M50 15 V74 A10 10 0 0 0 70 74 V15" },
  // e
  え: { d: "M50 22 L84 84 H16 Z" },
  け: { d: "M20 18 V84 M20 51 L80 18 V84 Z" },
  せ: { d: "M48 14 L18 50 H84 L58 88 Z" },
  て: { d: "M18 18 H82 M18 38 H82 L50 86 Z" },
  ね: { d: "M18 22 V80 L82 22 V80 Z" },
  へ: { d: "M22 18 H78 M50 40 L84 86 H16 Z" },
  め: { d: "M18 18 L82 84 V18 L18 84" },
  れ: { d: "M15 18 H75 L45 56 Z M45 56 V86 L84 54" },
  // o
  お: { rings: [[50, 52, 32]] },
  こ: { d: "M20 54 V18 H80 V68", rings: [[62, 70, 18]] },
  そ: { rings: [[50, 31, 18], [50, 69, 20]] },
  と: { d: "M50 12 V92", rings: [[50, 52, 25]] },
  の: { d: "M84 16 Q78 74 22 88", rings: [[36, 36, 18]] },
  ほ: { d: "M50 20 V84 M18 52 H82", rings: [[50, 52, 32]] },
  も: { d: "M50 12 V64 M20 26 H80 M20 44 H80", dots: [[50, 76, 15]] },
  を: { d: "M72 15 L16 84 H86 M42 54 H86" },
  ろ: { d: "M39 47 L15 86 M61 47 L85 86", rings: [[50, 32, 18]] },
  // specials
  ん: { d: "M84 14 L28 88", dots: [[30, 30, 15]] },
  ー: { d: "M15 20 L38 52 L15 84 M85 20 L62 52 L85 84 M38 52 H62" },
};

/** Small kana are drawn as a reduced copy of their full-size base. */
export const SMALL_KANA: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お",
  っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
};

export type Unit =
  | { kind: "glyph"; base: string; mark?: "dakuten" | "handakuten"; small: boolean; label: string }
  | { kind: "space" }
  | { kind: "text"; text: string };

const DAKUTEN = new Set(["゙", "゛"]);
const HANDAKUTEN = new Set(["゚", "゜"]);
const ALIAS: Record<string, string> = { ゐ: "い", ゑ: "え" };

/** Split one line of hiragana into drawable units. */
export function parseUnits(line: string): Unit[] {
  const units: Unit[] = [];
  for (const raw of Array.from(line.normalize("NFD"))) {
    const last = units[units.length - 1];
    if (DAKUTEN.has(raw) || HANDAKUTEN.has(raw)) {
      if (last && last.kind === "glyph" && !last.mark) {
        last.mark = DAKUTEN.has(raw) ? "dakuten" : "handakuten";
        last.label = (last.label + (DAKUTEN.has(raw) ? "゙" : "゚")).normalize("NFC");
      }
      continue;
    }
    const ch = ALIAS[raw] ?? raw;
    if (SMALL_KANA[ch]) units.push({ kind: "glyph", base: SMALL_KANA[ch], small: true, label: ch });
    else if (GLYPHS[ch]) units.push({ kind: "glyph", base: ch, small: false, label: ch });
    else if (ch === " " || ch === "　") units.push({ kind: "space" });
    else if (last && last.kind === "text") last.text += ch;
    else units.push({ kind: "text", text: ch });
  }
  return units;
}

/** Chart layout: columns あ→わ, rows a/i/u/e/o. Empty string = no kana in that cell. */
export const CHART_COLUMNS: string[][] = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", "", "ゆ", "", "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "", "", "", "を"],
];
export const CHART_EXTRAS = ["ん", "ー", "が", "ぱ", "っ"];
