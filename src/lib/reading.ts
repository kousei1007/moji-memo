import path from "node:path";
import kuromoji from "kuromoji";
import { toHiragana } from "./kana";

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let tokenizerPromise: Promise<Tokenizer> | null = null;

function getTokenizer(): Promise<Tokenizer> {
  tokenizerPromise ??= new Promise<Tokenizer>((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.join(process.cwd(), "node_modules", "kuromoji", "dict") })
      .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
  }).catch((err) => {
    tokenizerPromise = null;
    throw err;
  });
  return tokenizerPromise;
}

/** Convert kanji-kana mixed text to its hiragana reading, preserving line breaks. */
export async function toReading(text: string, keepLatin = false): Promise<string> {
  const tokenizer = await getTokenizer();
  const lines = text.split("\n").map((line) =>
    line === ""
      ? ""
      : tokenizer
          .tokenize(line)
          .map((t) =>
            (keepLatin && /[A-Za-zＡ-Ｚａ-ｚ0-9０-９]/.test(t.surface_form)) || !t.reading || t.reading === "*"
              ? t.surface_form
              : t.reading,
          )
          .join(""),
  );
  return toHiragana(lines.join("\n"), keepLatin);
}
