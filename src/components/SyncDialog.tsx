"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { SyncState } from "@/lib/useSync";
import { Button, Dialog, fieldClass } from "./ui";

const TITLE = "端末間の同期";

export default function SyncDialog({ sync, onClose }: { sync: SyncState; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const run = async (action: "signIn" | "signUp") => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (action === "signIn") await sync.signIn(email.trim(), password);
      else if ((await sync.signUp(email.trim(), password)) === "confirm-email") {
        setNotice({ kind: "info", text: "確認メールを送りました。メール内のリンクを開いてからログインしてください。" });
      }
      setPassword("");
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "失敗しました。" });
    } finally {
      setBusy(false);
    }
  };

  if (!sync.configured) {
    return (
      <Dialog title={TITLE} onClose={onClose} actions={<Button onClick={onClose}>閉じる</Button>}>
        <p className="mb-3">同期はまだ設定されていません。メモはこの端末のブラウザ内にだけ保存されています。</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Supabaseでプロジェクトを作成する</li>
          <li>
            SQL Editorで <code className="text-on-surface">supabase/schema.sql</code> を実行する
          </li>
          <li>
            <code className="text-on-surface">.env.local</code> に <code className="text-on-surface">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            と <code className="text-on-surface">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を書いて、開発サーバーを再起動する
          </li>
        </ol>
      </Dialog>
    );
  }

  if (sync.user) {
    const syncing = sync.status === "syncing";
    return (
      <Dialog
        title={TITLE}
        onClose={onClose}
        actions={
          <>
            <Button variant="danger" onClick={() => sync.signOut()}>
              ログアウト
            </Button>
            <Button
              variant="filled"
              disabled={syncing}
              icon={syncing ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              onClick={sync.syncNow}
            >
              今すぐ同期
            </Button>
          </>
        }
      >
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium">アカウント</dt>
            <dd className="text-base break-all text-on-surface">{sync.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium">状態</dt>
            <dd className="text-base text-on-surface" aria-live="polite">
              {syncing
                ? "同期中…"
                : sync.status === "error"
                  ? "同期に失敗しました"
                  : sync.lastSyncedAt
                    ? `同期済み（${new Date(sync.lastSyncedAt).toLocaleTimeString("ja-JP")}）`
                    : "待機中"}
            </dd>
          </div>
        </dl>
        {sync.status === "error" && sync.error && (
          <p role="alert" className="mt-3 rounded-xl bg-error-container px-4 py-3 text-on-error-container">
            {sync.error}
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed">
          編集の数秒後と、この画面に戻ったときに自動で同期します。同じメモを複数の端末で編集した場合は、あとから保存した内容が残ります。ログアウトしても、この端末のメモは消えません。
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={TITLE}
      onClose={onClose}
      actions={
        <>
          <Button disabled={busy || !email.trim() || !password} onClick={() => run("signUp")}>
            新規登録
          </Button>
          <Button variant="filled" disabled={busy || !email.trim() || !password} onClick={() => run("signIn")}>
            ログイン
          </Button>
        </>
      }
    >
      <p className="mb-4">ログインすると、メモとプロジェクトを複数の端末で同期できます。</p>
      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium">メールアドレス</span>
        <input
          className={fieldClass}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium">パスワード（6文字以上）</span>
        <input
          className={fieldClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run("signIn")}
        />
      </label>
      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl px-4 py-3 ${
            notice.kind === "error"
              ? "bg-error-container text-on-error-container"
              : "bg-secondary-container text-on-secondary-container"
          }`}
        >
          {notice.text}
        </p>
      )}
    </Dialog>
  );
}
