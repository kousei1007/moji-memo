"use client";

import { ExternalLink, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVIDERS, type Provider } from "@/lib/ai/types";
import { CHART_COLUMNS, CHART_EXTRAS, parseUnits } from "@/lib/glyphs";
import { fetchKana, keepLatin, toHiragana } from "@/lib/kana";
import type { AiSettings, Signature } from "@/lib/store";
import HunterText, { GlyphSvg } from "./HunterText";
import { Button, Dialog, IconButton, fieldClass } from "./ui";

/** Debounced hiragana reading of free text (used for live previews). */
export function useKana(text: string): string {
  const [result, setResult] = useState({ text, kana: toHiragana(text, keepLatin()) });
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const kana = await fetchKana(text);
      if (!cancelled) setResult({ text, kana });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);
  return result.text === text ? result.kana : toHiragana(text, keepLatin());
}

function ChartCell({ kana }: { kana: string }) {
  const unit = kana ? parseUnits(kana)[0] : null;
  return (
    <div className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl bg-surface-container-low text-on-surface">
      {unit?.kind === "glyph" && (
        <>
          <GlyphSvg unit={unit} size={30} />
          <span className="text-xs text-on-surface-variant">{kana}</span>
        </>
      )}
    </div>
  );
}

export function ChartDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="50音表" onClose={onClose} wide>
      {/* Columns run right to left (あ on the right), like a printed gojūon table. */}
      <div className="grid grid-cols-10 gap-1.5" dir="rtl">
        {[0, 1, 2, 3, 4].flatMap((row) =>
          CHART_COLUMNS.map((col, c) => <ChartCell key={`${row}-${c}`} kana={col[row]} />),
        )}
      </div>
      <div className="mt-4 grid grid-cols-10 gap-1.5">
        {CHART_EXTRAS.map((k) => (
          <ChartCell key={k} kana={k} />
        ))}
      </div>
      <p className="mt-4">
        濁点は右下の黒丸、半濁点は右下の白丸で表します。小さい「っ・ゃ・ゅ・ょ」は小さく描かれます。カタカナ・漢字・英数字は、読みのひらがなに直してから描きます。
      </p>
    </Dialog>
  );
}

type NameDialogProps = {
  title: string;
  initial: string;
  onSubmit: (name: string, kana: string) => void;
  onClose: () => void;
};

export function NameDialog({ title, initial, onSubmit, onClose }: NameDialogProps) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const kana = useKana(name);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    onSubmit(trimmed, await fetchKana(trimmed));
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="filled" disabled={!name.trim() || busy} onClick={submit}>
            保存
          </Button>
        </>
      }
    >
      <div className="mb-4 flex min-h-20 items-center rounded-2xl bg-surface-container-low px-4 py-3 text-on-surface">
        <HunterText kana={kana} size={30} showReading />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium">プロジェクト名（ふつうの日本語で入力）</span>
        <input
          className={fieldClass}
          value={name}
          maxLength={40}
          placeholder="例：旅行の計画"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
        />
      </label>
    </Dialog>
  );
}

type ConfirmProps = { title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void };

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button data-autofocus onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}

type AiDialogProps = { settings: AiSettings; onSave: (s: AiSettings) => void; onClose: () => void };

export function AiDialog({ settings, onSave, onClose }: AiDialogProps) {
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const provider = draft.provider;
  const info = PROVIDERS[provider];

  return (
    <Dialog
      title="AIに接続"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="filled" onClick={() => onSave(draft)}>
            保存
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="使用するAI" className="mb-5 flex overflow-hidden rounded-full border border-outline">
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === provider}
            onClick={() => setDraft({ ...draft, provider: p })}
            className={`h-10 flex-1 border-outline text-sm font-medium not-first:border-l ${
              p === provider ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-on-surface/8"
            }`}
          >
            {PROVIDERS[p].label.split(" ")[0]}
          </button>
        ))}
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium">{info.label} の APIキー</span>
        <span className="flex items-center gap-1">
          <input
            className={fieldClass}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={info.keyHint}
            value={draft.keys[provider]}
            onChange={(e) => setDraft({ ...draft, keys: { ...draft.keys, [provider]: e.target.value } })}
          />
          <IconButton label={showKey ? "キーを隠す" : "キーを表示"} onClick={() => setShowKey(!showKey)}>
            {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
          </IconButton>
        </span>
      </label>
      <a
        href={info.keyUrl}
        target="_blank"
        rel="noreferrer"
        className="mb-5 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
      >
        公式サイトでAPIキーを発行する
        <ExternalLink size={14} />
      </a>

      <label className="mb-5 block">
        <span className="mb-1.5 block text-xs font-medium">モデル名</span>
        <input
          className={fieldClass}
          spellCheck={false}
          placeholder={info.defaultModel}
          value={draft.models[provider]}
          onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [provider]: e.target.value } })}
        />
      </label>

      <div className="flex gap-3 rounded-2xl bg-surface-container-low p-4">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed">
          各社が公式に認めている「自分のAPIキーを使う」方式で接続します。ChatGPTやClaudeの月額プランのID・パスワードをこのアプリに入力する方式は、各社の利用規約に反するため採用していません。キーはこのブラウザ内にのみ保存され、要約を実行するときだけAIの提供元へ送られます。利用料金は各社のAPI料金としてあなたのアカウントに請求されます。
        </p>
      </div>
    </Dialog>
  );
}

type SignatureDialogProps = { signature: Signature; onSave: (s: Signature) => void; onClose: () => void };

export function SignatureDialog({ signature, onSave, onClose }: SignatureDialogProps) {
  const [text, setText] = useState(signature.text);
  const [busy, setBusy] = useState(false);
  const kana = useKana(text);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const trimmed = text.trim();
    onSave({ text: trimmed, kana: trimmed ? await fetchKana(trimmed) : "" });
  };

  return (
    <Dialog
      title="署名"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="filled" disabled={busy} onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <p className="mb-4">新しいメモを作ると、ここで決めた署名が本文の最後に自動で入ります。空にすると署名は入りません。</p>
      <div className="mb-4 flex min-h-20 items-center rounded-2xl bg-surface-container-low px-4 py-3 text-on-surface">
        <HunterText kana={kana} size={26} showReading />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium">署名（ふつうの日本語で入力・複数行可）</span>
        <textarea
          className={fieldClass}
          rows={3}
          maxLength={200}
          value={text}
          placeholder="例：やまだ たろう"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
    </Dialog>
  );
}
