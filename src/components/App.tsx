"use client";

import {
  AArrowDown,
  AArrowUp,
  ArrowLeft,
  BookOpen,
  CaseSensitive,
  Cloud,
  CloudAlert,
  CloudOff,
  Eraser,
  FileDown,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  KeyRound,
  Languages,
  LoaderCircle,
  Pencil,
  RotateCw,
  Signature as SignatureIcon,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, type ImageInput } from "@/lib/ai/types";
import { fetchKana, hasKanji, keepLatin, setKeepLatin, toHiragana } from "@/lib/kana";
import {
  defaultAiSettings,
  fileToDataUrl,
  loadAiSettings,
  loadData,
  loadSignature,
  newId,
  saveAiSettings,
  saveData,
  saveSignature,
  type AiSettings,
  type Data,
  type Layout,
  type Memo,
  type Signature,
  type Tombstone,
} from "@/lib/store";
import { useSync } from "@/lib/useSync";
import { AiDialog, ChartDialog, ConfirmDialog, NameDialog, SignatureDialog } from "./dialogs";
import SyncDialog from "./SyncDialog";
import HunterText from "./HunterText";
import { Button, IconButton } from "./ui";

type Pane = "projects" | "memos" | "editor";
type DialogState =
  | { type: "chart" }
  | { type: "ai" }
  | { type: "sync" }
  | { type: "signature" }
  | { type: "newProject" }
  | { type: "renameProject"; id: string }
  | { type: "deleteProject"; id: string }
  | { type: "deleteMemo"; id: string }
  | null;

const MAX_IMAGES = 8;

declare global {
  interface Window {
    /** Present only inside the desktop app (see electron/preload.cjs). */
    desktop?: { savePdf: (name: string) => Promise<boolean> };
  }
}

/** Everything written in a memo: the main text plus the texts placed on the page. */
const allText = (m: Memo) =>
  [m.body, ...(m.layout?.texts ?? []).map((t) => t.body)].filter((s) => s.trim()).join("\n");

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [memoId, setMemoId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("memos");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [showReading, setShowReading] = useState(false);
  const [latin, setLatin] = useState(false);
  const [ai, setAi] = useState<AiSettings>(defaultAiSettings);
  const [signature, setSignature] = useState<Signature>({ text: "", kana: "" });
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useSync(data, setData);

  const closeDialog = useCallback(() => setDialog(null), []);

  // Load once on mount; persist (debounced) on every change afterwards.
  useEffect(() => {
    let cancelled = false;
    loadData().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setProjectId(loaded.projects[0].id);
      setAi(loadAiSettings());
      setSignature(loadSignature());
      setLatin(keepLatin());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      saveData(data).catch(() => setError("保存に失敗しました。ブラウザの空き容量を確認してください。"));
    }, 300);
    return () => clearTimeout(timer);
  }, [data]);

  const patchMemo = useCallback((id: string, patch: Partial<Memo> | ((m: Memo) => Partial<Memo>)) => {
    setData(
      (d) =>
        d && {
          ...d,
          memos: d.memos.map((m) => {
            if (m.id !== id) return m;
            const change = typeof patch === "function" ? patch(m) : patch;
            // Every real change is stamped so sync can tell which device has the newer copy.
            return Object.keys(change).length === 0 ? m : { ...m, ...change, updatedAt: Date.now() };
          }),
        },
    );
  }, []);

  /** Remove memos, remembering the deletions (and those of their images) for sync. */
  const withMemosRemoved = (d: Data, ids: Set<string>): Data => {
    const at = Date.now();
    const tombstones: Tombstone[] = d.memos
      .filter((m) => ids.has(m.id))
      .flatMap((m) => [
        { table: "memos" as const, id: m.id, at },
        ...m.images.map((img) => ({ table: "memo_images" as const, id: img.id, at })),
      ]);
    return { ...d, memos: d.memos.filter((m) => !ids.has(m.id)), tombstones: [...d.tombstones, ...tombstones] };
  };

  const project = data?.projects.find((p) => p.id === projectId) ?? null;
  const memos = useMemo(
    () => (data?.memos ?? []).filter((m) => m.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt),
    [data, projectId],
  );
  const memo = data?.memos.find((m) => m.id === memoId) ?? null;

  // --- memo editing -------------------------------------------------------
  const kanaJob = useRef({ seq: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });

  /** Edit the main text, or the placed text `boxId` when given. */
  const editBody = (id: string, body: string, boxId?: string) => {
    const job = kanaJob.current;
    const seq = ++job.seq;
    clearTimeout(job.timer);
    const bodyOf = (m: Memo) => (boxId ? m.layout?.texts?.find((t) => t.id === boxId)?.body : m.body);
    const change = (m: Memo, c: { body?: string; kana?: string }): Partial<Memo> =>
      boxId
        ? { layout: { ...m.layout, texts: m.layout?.texts?.map((t) => (t.id === boxId ? { ...t, ...c } : t)) } }
        : c;
    if (!hasKanji(body)) {
      patchMemo(id, (m) => change(m, { body, kana: toHiragana(body, keepLatin()) }));
      return;
    }
    // Kanji need a dictionary lookup: keep the previous drawing until the reading arrives.
    patchMemo(id, (m) => change(m, { body }));
    job.timer = setTimeout(async () => {
      const kana = await fetchKana(body);
      if (seq === kanaJob.current.seq) patchMemo(id, (m) => (bodyOf(m) === body ? change(m, { kana }) : {}));
    }, 120);
  };

  /** Redraw the open memo after the alphabet mode changes (other memos follow when next edited). */
  const toggleLatin = async () => {
    setKeepLatin(!latin);
    setLatin(!latin);
    if (!memo) return;
    const kana = await fetchKana(memo.body);
    const texts = await Promise.all(
      (memo.layout?.texts ?? []).map(async (t) => ({ ...t, kana: await fetchKana(t.body) })),
    );
    const bodies = (m: Memo) => [m.body, ...(m.layout?.texts ?? []).map((t) => t.body)].join("\u0000");
    patchMemo(memo.id, (m) =>
      bodies(m) !== bodies(memo) ? {} : { kana, ...(memo.layout ? { layout: { ...m.layout, texts } } : {}) },
    );
  };

  const createMemo = () => {
    if (!projectId) return;
    // Like an e-mail: the signature goes in below two blank lines, and typing starts above it.
    const sign = (s: string) => (signature.text ? "\n\n" + s : "");
    const created: Memo = {
      id: newId(),
      projectId,
      body: sign(signature.text),
      kana: sign(signature.kana),
      images: [],
      updatedAt: Date.now(),
    };
    setData((d) => d && { ...d, memos: [...d.memos, created] });
    setMemoId(created.id);
    setPane("editor");
  };

  const addImages = async (id: string, files: File[]) => {
    const current = data?.memos.find((m) => m.id === id)?.images.length ?? 0;
    const accepted = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES - current);
    if (accepted.length < files.length) setError(`画像は1つのメモに${MAX_IMAGES}枚まで添付できます。`);
    try {
      const images = await Promise.all(accepted.map(async (f) => ({ id: newId(), dataUrl: await fileToDataUrl(f) })));
      patchMemo(id, (m) => ({ images: [...m.images, ...images], updatedAt: Date.now() }));
    } catch {
      setError("画像を読み込めませんでした。");
    }
  };

  const summarize = async (target: Memo) => {
    const apiKey = ai.keys[ai.provider].trim();
    if (!apiKey) {
      setDialog({ type: "ai" });
      return;
    }
    setSummarizing(target.id);
    setError(null);
    try {
      const images: ImageInput[] = target.images.map((img) => ({
        mediaType: "image/jpeg",
        data: img.dataUrl.slice(img.dataUrl.indexOf(",") + 1),
      }));
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: ai.provider,
          apiKey,
          model: ai.models[ai.provider],
          text: allText(target),
          images,
        }),
      });
      const json = (await res.json()) as { text?: string; kana?: string; error?: string };
      if (!res.ok || !json.text || !json.kana) throw new Error(json.error ?? "要約に失敗しました。");
      patchMemo(target.id, { summary: { text: json.text, kana: json.kana } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "要約に失敗しました。");
    } finally {
      setSummarizing(null);
    }
  };

  // --- render -------------------------------------------------------------
  if (!data) {
    return (
      <div className="flex h-dvh items-center justify-center text-on-surface-variant">
        <LoaderCircle className="animate-spin" aria-label="読み込み中" />
      </div>
    );
  }

  const paneClass = (p: Pane) => (pane === p ? "flex" : "hidden lg:flex");
  const canSummarize = !!memo && (allText(memo) !== "" || memo.images.length > 0);

  return (
    <div className="flex h-dvh flex-col print:block print:h-auto">
      <header className="flex h-16 shrink-0 items-center gap-1 px-2 sm:px-4 print:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-2">
          <HunterText kana="もじめも" size={22} className="shrink-0 text-primary [&>div]:mb-0!" />
          <h1 className="truncate text-lg font-medium">もじメモ</h1>
        </div>
        <IconButton
          label={latin ? "英数字をそのまま表示中（押すと読みに変換）" : "英数字をそのまま表示"}
          active={latin}
          onClick={toggleLatin}
        >
          <CaseSensitive size={22} />
        </IconButton>
        <IconButton label="よみがなを表示" active={showReading} onClick={() => setShowReading(!showReading)}>
          <Languages size={22} />
        </IconButton>
        <IconButton label="署名" onClick={() => setDialog({ type: "signature" })}>
          <SignatureIcon size={22} />
        </IconButton>
        <IconButton label="50音表" onClick={() => setDialog({ type: "chart" })}>
          <BookOpen size={22} />
        </IconButton>
        <IconButton
          label={
            !sync.user
              ? "同期（未ログイン）"
              : sync.status === "error"
                ? "同期エラー"
                : sync.status === "syncing"
                  ? "同期中"
                  : "同期済み"
          }
          onClick={() => setDialog({ type: "sync" })}
        >
          {!sync.user ? (
            <CloudOff size={22} />
          ) : sync.status === "error" ? (
            <CloudAlert size={22} className="text-error" />
          ) : (
            <Cloud size={22} className={sync.status === "syncing" ? "animate-pulse text-primary" : "text-primary"} />
          )}
        </IconButton>
        <IconButton label="AIに接続" onClick={() => setDialog({ type: "ai" })}>
          <KeyRound size={22} />
        </IconButton>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-4 sm:pb-4 print:block print:p-0">
        {/* Projects */}
        <nav aria-label="プロジェクト" className={`${paneClass("projects")} w-full flex-col lg:w-64 lg:shrink-0 print:hidden`}>
          <div className="flex h-12 items-center justify-between pl-4">
            <h2 className="text-sm font-medium text-on-surface-variant">プロジェクト</h2>
            <IconButton label="新しいプロジェクト" onClick={() => setDialog({ type: "newProject" })}>
              <FolderPlus size={20} />
            </IconButton>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {data.projects.map((p) => {
              const selected = p.id === projectId;
              const count = data.memos.filter((m) => m.projectId === p.id).length;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      setProjectId(p.id);
                      setMemoId(null);
                      setPane("memos");
                    }}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-full py-2 pr-5 pl-4 text-left transition-colors ${
                      selected ? "bg-secondary-container text-on-secondary-container" : "hover:bg-on-surface/8"
                    }`}
                  >
                    {selected ? <FolderOpen size={20} className="shrink-0" /> : <Folder size={20} className="shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <HunterText kana={p.kana} size={18} maxUnits={9} className="[&>div]:mb-0! [&>div]:flex-nowrap" />
                      {showReading && <span className="block truncate text-xs opacity-80">{p.name}</span>}
                    </span>
                    <span className="text-xs tabular-nums opacity-70">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Memo list */}
        <section
          aria-label="メモ一覧"
          className={`${paneClass("memos")} w-full flex-col rounded-3xl bg-surface-container-low lg:w-80 lg:shrink-0 print:hidden`}
        >
          <div className="flex h-14 items-center gap-1 pr-2 pl-2">
            <IconButton label="プロジェクト一覧へ" className="lg:hidden" onClick={() => setPane("projects")}>
              <ArrowLeft size={22} />
            </IconButton>
            <div className="min-w-0 flex-1 pl-2">
              {project && (
                <HunterText kana={project.kana} size={20} maxUnits={8} className="[&>div]:mb-0! [&>div]:flex-nowrap" />
              )}
            </div>
            {project && (
              <>
                <IconButton label="プロジェクト名を変更" onClick={() => setDialog({ type: "renameProject", id: project.id })}>
                  <Pencil size={18} />
                </IconButton>
                <IconButton
                  label="プロジェクトを削除"
                  disabled={data.projects.length <= 1}
                  onClick={() => setDialog({ type: "deleteProject", id: project.id })}
                >
                  <Trash2 size={18} />
                </IconButton>
              </>
            )}
          </div>
          <div className="px-3 pb-2">
            <Button variant="filled" icon={<FilePlus2 size={18} />} className="w-full" onClick={createMemo}>
              新しいメモ
            </Button>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            {memos.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-on-surface-variant">
                このプロジェクトにはまだメモがありません。
              </li>
            )}
            {memos.map((m) => {
              const selected = m.id === memoId;
              const empty = !m.kana.trim();
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      setMemoId(m.id);
                      setPane("editor");
                    }}
                    className={`block w-full rounded-2xl p-4 text-left transition-colors ${
                      selected
                        ? "bg-secondary-container text-on-secondary-container"
                        : "bg-surface-container-high hover:bg-surface-container-highest"
                    }`}
                  >
                    {empty ? (
                      <span className="text-sm opacity-70">{m.images.length ? "画像のみのメモ" : "空のメモ"}</span>
                    ) : (
                      <HunterText kana={m.kana} size={20} maxUnits={10} className="[&>div]:mb-0! [&>div]:flex-nowrap" />
                    )}
                    {showReading && !empty && (
                      <span className="mt-1 block truncate text-xs opacity-80">{m.body.split("\n").find(Boolean)}</span>
                    )}
                    <span className="mt-2 flex items-center gap-2 text-xs opacity-70">
                      <time dateTime={new Date(m.updatedAt).toISOString()}>
                        {new Date(m.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
                      </time>
                      {m.images.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImagePlus size={12} />
                          {m.images.length}
                        </span>
                      )}
                      {m.summary && <Sparkles size={12} aria-label="要約あり" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Editor */}
        <main
          className={`${paneClass("editor")} min-w-0 flex-1 flex-col rounded-3xl bg-surface-container-low print:block print:bg-transparent`}
        >
          {!memo ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-on-surface-variant">
              <HunterText kana="めもをえらぶ" size={34} className="opacity-60" />
              <p className="text-sm">メモを選ぶか、新しいメモを作成してください。</p>
              <Button variant="tonal" icon={<FilePlus2 size={18} />} onClick={createMemo}>
                新しいメモ
              </Button>
            </div>
          ) : (
            <Editor
              key={memo.id}
              memo={memo}
              showReading={showReading}
              summarizing={summarizing === memo.id}
              canSummarize={canSummarize}
              aiLabel={PROVIDERS[ai.provider].label}
              onBack={() => setPane("memos")}
              onChange={(body, boxId) => editBody(memo.id, body, boxId)}
              onLayout={(layout) => patchMemo(memo.id, { layout })}
              onAddImages={(files) => addImages(memo.id, files)}
              onRemoveImage={(imageId) => {
                patchMemo(memo.id, (m) => ({ images: m.images.filter((i) => i.id !== imageId) }));
                setData(
                  (d) =>
                    d && { ...d, tombstones: [...d.tombstones, { table: "memo_images", id: imageId, at: Date.now() }] },
                );
              }}
              onSummarize={() => summarize(memo)}
              onClearSummary={() => patchMemo(memo.id, { summary: undefined })}
              onDelete={() => setDialog({ type: "deleteMemo", id: memo.id })}
            />
          )}
        </main>
      </div>

      {error && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl print:hidden items-center gap-2 rounded-xl bg-error-container py-2 pr-2 pl-4 text-sm text-on-error-container shadow-lg"
        >
          <span className="flex-1">{error}</span>
          <IconButton label="閉じる" className="text-on-error-container!" onClick={() => setError(null)}>
            <X size={20} />
          </IconButton>
        </div>
      )}

      {dialog?.type === "chart" && <ChartDialog onClose={closeDialog} />}
      {dialog?.type === "signature" && (
        <SignatureDialog
          signature={signature}
          onClose={closeDialog}
          onSave={(next) => {
            setSignature(next);
            saveSignature(next);
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "sync" && <SyncDialog sync={sync} onClose={closeDialog} />}
      {dialog?.type === "ai" && (
        <AiDialog
          settings={ai}
          onClose={closeDialog}
          onSave={(next) => {
            setAi(next);
            saveAiSettings(next);
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "newProject" && (
        <NameDialog
          title="新しいプロジェクト"
          initial=""
          onClose={closeDialog}
          onSubmit={(name, kana) => {
            const id = newId();
            setData((d) => d && { ...d, projects: [...d.projects, { id, name, kana, updatedAt: Date.now() }] });
            setProjectId(id);
            setMemoId(null);
            setPane("memos");
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "renameProject" && (
        <NameDialog
          title="プロジェクト名を変更"
          initial={data.projects.find((p) => p.id === dialog.id)?.name ?? ""}
          onClose={closeDialog}
          onSubmit={(name, kana) => {
            setData(
              (d) =>
                d && {
                  ...d,
                  projects: d.projects.map((p) =>
                    p.id === dialog.id ? { ...p, name, kana, updatedAt: Date.now() } : p,
                  ),
                },
            );
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "deleteProject" && (
        <ConfirmDialog
          title="プロジェクトを削除"
          message={`「${data.projects.find((p) => p.id === dialog.id)?.name}」と、その中のメモ${
            data.memos.filter((m) => m.projectId === dialog.id).length
          }件を削除します。この操作は取り消せません。`}
          confirmLabel="削除"
          onClose={closeDialog}
          onConfirm={() => {
            const rest = data.projects.filter((p) => p.id !== dialog.id);
            const memoIds = new Set(data.memos.filter((m) => m.projectId === dialog.id).map((m) => m.id));
            const next = withMemosRemoved(data, memoIds);
            setData({
              ...next,
              projects: rest,
              tombstones: [...next.tombstones, { table: "projects", id: dialog.id, at: Date.now() }],
            });
            setProjectId(rest[0].id);
            setMemoId(null);
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "deleteMemo" && (
        <ConfirmDialog
          title="メモを削除"
          message="このメモを削除します。この操作は取り消せません。"
          confirmLabel="削除"
          onClose={closeDialog}
          onConfirm={() => {
            setData(withMemosRemoved(data, new Set([dialog.id])));
            setMemoId(null);
            setPane("memos");
            closeDialog();
          }}
        />
      )}
    </div>
  );
}

type EditorProps = {
  memo: Memo;
  showReading: boolean;
  summarizing: boolean;
  canSummarize: boolean;
  aiLabel: string;
  onBack: () => void;
  /** `boxId` names the placed text being edited; omitted for the main text. */
  onChange: (body: string, boxId?: string) => void;
  onLayout: (layout: Layout) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onSummarize: () => void;
  onClearSummary: () => void;
  onDelete: () => void;
};

/** Word-style presets; any value in between can be typed. Numbers are the glyph height in px. */
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 38, 48, 56, 72, 80, 96, 120];
const MIN_SIZE = 6;
const MAX_SIZE = 200;
const DEFAULT_SIZE = 38;

/** Follow the pointer from a pointerdown until release, reporting the distance moved. */
function drag(e: React.PointerEvent, onMove: (dx: number, dy: number) => void) {
  const { clientX: sx, clientY: sy } = e;
  const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function Editor(props: EditorProps) {
  const { memo, showReading, summarizing } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  const layout = memo.layout ?? {};
  const texts = layout.texts ?? [];
  /** Selected text box; null means the main text. The input field and the style controls act on it. */
  const [selected, setSelected] = useState<string | null>(null);
  const box = texts.find((t) => t.id === selected);

  const setLayout = (change: Partial<Layout>) => props.onLayout({ ...layout, ...change });
  /** Text boxes worth keeping: abandoned empty ones are dropped whenever the selection moves on. */
  const kept = (keepId?: string) => texts.filter((t) => t.body.trim() || t.id === keepId);
  const select = (id: string | null) => {
    setSelected(id);
    if (kept(id ?? undefined).length !== texts.length) setLayout({ texts: kept(id ?? undefined) });
  };
  const setStyle = (style: { size?: number; color?: string }) =>
    setLayout(box ? { texts: texts.map((t) => (t.id === box.id ? { ...t, ...style } : t)) } : style);
  const size = (box ? box.size : layout.size) ?? DEFAULT_SIZE;
  /** What is typed in the size box while it is being edited (may be briefly empty or out of range). */
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const changeSize = (next: number) => setStyle({ size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, next)) });
  const stepSize = (next: number) => {
    setSizeDraft(null);
    changeSize(next);
  };
  const color = box ? box.color : layout.color;

  /** Where an element sits inside the canvas, for items that are still in the normal flow. */
  const measure = (el: HTMLElement): { x: number; y: number; w: number; r?: number } => {
    const r = el.getBoundingClientRect();
    const c = canvas.current!.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width };
  };
  const setImage = (id: string, place: { x: number; y: number; w: number; r?: number }) =>
    setLayout({ images: { ...layout.images, [id]: place } });

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) textarea.current?.focus();
    // A new memo may already hold the signature: start typing above it, not after it.
    if (textarea.current?.value.startsWith("\n")) textarea.current?.setSelectionRange(0, 0);
  }, []);

  // Positioned items don't stretch their container: keep the canvas tall enough to hold them,
  // plus room below to double-click and keep writing.
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let bottom = 0;
    el.querySelectorAll<HTMLElement>("[data-item]").forEach((item) => {
      bottom = Math.max(bottom, item.offsetTop + item.offsetHeight);
    });
    el.style.minHeight = `${bottom + 160}px`;
  });

  const savePdf = async () => {
    const name = memo.body.split("\n").find((line) => line.trim())?.trim().slice(0, 30) || "memo";
    if (window.desktop) await window.desktop.savePdf(name);
    else window.print(); // in a browser: choose "PDF に保存" in the print dialog
  };

  return (
    <>
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-1 px-2 print:hidden">
        <IconButton label="メモ一覧へ" className="lg:hidden" onClick={props.onBack}>
          <ArrowLeft size={22} />
        </IconButton>
        <label className="ml-2 flex items-center gap-1 text-on-surface-variant" title="文字の大きさ">
          <Type size={18} />
          <input
            type="number"
            aria-label="文字の大きさ"
            list="memo-font-sizes"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={0.5}
            value={sizeDraft ?? size}
            onChange={(e) => {
              setSizeDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== "" && n >= MIN_SIZE && n <= MAX_SIZE) changeSize(n);
            }}
            onBlur={() => setSizeDraft(null)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-10 w-20 rounded-lg border border-outline-variant bg-transparent px-2 text-sm text-on-surface"
          />
          <datalist id="memo-font-sizes">
            {SIZES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <IconButton label="文字を大きく" onClick={() => stepSize(SIZES.find((s) => s > size) ?? MAX_SIZE)}>
          <AArrowUp size={20} />
        </IconButton>
        <IconButton
          label="文字を小さく"
          onClick={() => stepSize([...SIZES].reverse().find((s) => s < size) ?? MIN_SIZE)}
        >
          <AArrowDown size={20} />
        </IconButton>
        <label className="flex size-12 items-center justify-center" title="文字の色">
          <input
            type="color"
            aria-label="文字の色"
            value={color ?? "#181d19"}
            onChange={(e) => setStyle({ color: e.target.value })}
            className="size-7 cursor-pointer rounded-full border border-outline bg-transparent"
          />
        </label>
        {color && (
          <IconButton label="文字の色を標準に戻す" onClick={() => setStyle({ color: undefined })}>
            <Eraser size={20} />
          </IconButton>
        )}
        <div className="flex-1" />
        <Button
          variant="tonal"
          disabled={!props.canSummarize || summarizing}
          icon={summarizing ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}
          onClick={props.onSummarize}
          title={`${props.aiLabel} で要約`}
        >
          {summarizing ? "要約中…" : "要約"}
        </Button>
        <IconButton label="PDFで保存" onClick={savePdf}>
          <FileDown size={22} />
        </IconButton>
        <IconButton label="画像を添付" onClick={() => fileInput.current?.click()}>
          <ImagePlus size={22} />
        </IconButton>
        <IconButton label="メモを削除" onClick={props.onDelete}>
          <Trash2 size={22} />
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            props.onAddImages(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 sm:px-8 print:block print:overflow-visible print:p-0">
        {memo.summary && (
          <section aria-label="要約" className="rounded-2xl bg-primary-container p-4 text-on-primary-container">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles size={16} />
              <h3 className="flex-1 text-sm font-medium">要約</h3>
              <IconButton
                label="要約を消す"
                className="-my-2 -mr-2 text-on-primary-container! print:hidden"
                onClick={props.onClearSummary}
              >
                <X size={18} />
              </IconButton>
            </div>
            <HunterText kana={memo.summary.kana} size={24} showReading={showReading} />
            {showReading && <p className="mt-1 text-sm leading-relaxed opacity-90">{memo.summary.text}</p>}
          </section>
        )}

        {/* The memo page. Double-click an empty spot to start a text there; drag text and images to move them. */}
        <div
          ref={canvas}
          className="relative flex-1"
          onClick={(e) => !(e.target as HTMLElement).closest("[data-item]") && select(null)}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-item]")) return;
            const c = e.currentTarget.getBoundingClientRect();
            const id = newId();
            const at = { x: Math.max(0, e.clientX - c.left), y: Math.max(0, e.clientY - c.top - DEFAULT_SIZE / 2) };
            setLayout({ texts: [...kept(), { id, ...at, body: "", kana: "" }] });
            setSelected(id);
            textarea.current?.focus();
          }}
        >
          {memo.kana.trim() ? (
            <div
              data-item
              className={`rounded-lg ${selected === null && texts.length > 0 ? "outline-1 outline-offset-4 outline-outline-variant outline-dashed print:outline-none" : ""}`}
              style={{ color: layout.color }}
              onClick={() => select(null)}
            >
              <HunterText kana={memo.kana} size={layout.size ?? DEFAULT_SIZE} showReading={showReading} />
            </div>
          ) : (
            texts.length === 0 && (
              <p className="py-6 text-sm text-on-surface-variant print:hidden">
                下の入力欄にふつうの日本語で入力すると、ここに文字が描かれます。漢字に変換しても、読みのひらがなで表示されます。好きな場所をダブルクリックすると、そこから書き始められます。
              </p>
            )
          )}

          {memo.images.map((img, i) => {
            const place = layout.images?.[img.id];
            return (
              <div
                key={img.id}
                data-item
                className={`touch-none select-none ${place ? "absolute cursor-move" : "relative mr-3 mb-3 inline-block cursor-move align-top"}`}
                style={place ? { left: place.x, top: place.y, width: place.w } : undefined}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("button,[data-resize]")) return;
                  const start = place ?? measure(e.currentTarget);
                  drag(e, (dx, dy) =>
                    setImage(img.id, { ...start, x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) }),
                  );
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimise */}
                <img
                  src={img.dataUrl}
                  alt={`添付画像 ${i + 1}`}
                  draggable={false}
                  style={place?.r ? { transform: `rotate(${place.r}deg)` } : undefined}
                  className={`rounded-xl border border-outline-variant ${place ? "block w-full" : "h-32 max-w-56 object-cover"}`}
                />
                <IconButton
                  label={`添付画像 ${i + 1} を削除`}
                  className="absolute top-1 right-1 size-8! bg-surface-container-highest/90 text-on-surface! print:hidden"
                  onClick={() => props.onRemoveImage(img.id)}
                >
                  <X size={16} />
                </IconButton>
                <IconButton
                  label={`添付画像 ${i + 1} を回転（ドラッグで1度ずつ、クリックで90度）: 現在 ${place?.r ?? 0}度`}
                  className="absolute top-1 right-10 size-8! cursor-grab touch-none bg-surface-container-highest/90 text-on-surface! print:hidden"
                  onPointerDown={(e) => {
                    // Dragging the button turns the image around its centre, following the pointer.
                    const button = e.currentTarget;
                    const start = place ?? measure(button.parentElement!);
                    const box = button.parentElement!.getBoundingClientRect();
                    const cx = box.left + box.width / 2;
                    const cy = box.top + box.height / 2;
                    const angle = (x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
                    const from = angle(e.clientX, e.clientY);
                    delete button.dataset.dragged;
                    drag(e, (dx, dy) => {
                      button.dataset.dragged = "1";
                      const turned = angle(e.clientX + dx, e.clientY + dy) - from;
                      setImage(img.id, { ...start, r: (Math.round((start.r ?? 0) + turned) + 360) % 360 });
                    });
                  }}
                  onClick={(e) => {
                    if (e.currentTarget.dataset.dragged) return; // that was a drag, not a click
                    const start = place ?? measure(e.currentTarget.parentElement!);
                    setImage(img.id, { ...start, r: ((start.r ?? 0) + 90) % 360 });
                  }}
                >
                  <RotateCw size={16} />
                </IconButton>
                <span
                  data-resize
                  title="ドラッグで大きさを変更"
                  className="absolute -right-1.5 -bottom-1.5 size-5 cursor-nwse-resize rounded-full border-2 border-surface bg-primary print:hidden"
                  onPointerDown={(e) => {
                    const start = place ?? measure(e.currentTarget.parentElement!);
                    drag(e, (dx) => setImage(img.id, { ...start, w: Math.max(48, start.w + dx) }));
                  }}
                />
              </div>
            );
          })}

          {texts.map((t) => (
            <div
              key={t.id}
              data-item
              className={`absolute cursor-move touch-none rounded-lg select-none ${
                t.id === selected ? "outline-2 outline-offset-4 outline-primary outline-dashed print:outline-none" : ""
              }`}
              style={{ left: t.x, top: t.y, maxWidth: `calc(100% - ${t.x}px)`, color: t.color }}
              onPointerDown={(e) => {
                setSelected(t.id);
                const rest = kept(t.id);
                drag(e, (dx, dy) =>
                  setLayout({
                    texts: rest.map((o) =>
                      o.id === t.id ? { ...o, x: Math.max(0, t.x + dx), y: Math.max(0, t.y + dy) } : o,
                    ),
                  }),
                );
              }}
            >
              {t.kana.trim() ? (
                <HunterText kana={t.kana} size={t.size ?? DEFAULT_SIZE} showReading={showReading} className="[&>div:last-child]:mb-0!" />
              ) : (
                t.id === selected && (
                  <span className="block w-0.5 animate-pulse bg-primary print:hidden" style={{ height: t.size ?? DEFAULT_SIZE }} />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5 print:hidden">
        <label className="block rounded-2xl bg-surface-container-highest px-4 pt-2 pb-1 focus-within:ring-2 focus-within:ring-primary">
          <span className="text-xs font-medium text-on-surface-variant">
            {box ? "入力（選択した位置のテキスト）" : "入力（ふつうの日本語）"}
          </span>
          <textarea
            ref={textarea}
            rows={3}
            value={box ? box.body : memo.body}
            placeholder="ここに入力…"
            className="block max-h-48 min-h-16 w-full resize-y bg-transparent py-1 text-base outline-none placeholder:text-on-surface-variant/70"
            onChange={(e) => props.onChange(e.target.value, box?.id)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                props.onAddImages(files);
              }
            }}
          />
        </label>
      </div>
    </>
  );
}
