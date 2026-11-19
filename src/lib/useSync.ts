"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { merge } from "./merge";
import type { Data } from "./store";
import { downloadImages, pull, push, supabase } from "./supabase";

export type SyncUser = { id: string; email: string };
export type SyncState = {
  /** False when Supabase env vars are missing: the app is local-only. */
  configured: boolean;
  user: SyncUser | null;
  status: "idle" | "syncing" | "error";
  error: string | null;
  lastSyncedAt: number | null;
  syncNow: () => void;
  /** Resolve to a message for the user, or throw with one. */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<"signed-in" | "confirm-email">;
  signOut: () => Promise<void>;
};

const tombstoneKey = (t: { table: string; id: string; at: number }) => `${t.table}:${t.id}:${t.at}`;

function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return "メールアドレスまたはパスワードが違います。";
  if (/email not confirmed/i.test(message)) return "確認メールのリンクを開いてからログインしてください。";
  if (/already registered/i.test(message)) return "このメールアドレスは登録済みです。ログインしてください。";
  if (/password should be at least/i.test(message)) return "パスワードが短すぎます。";
  if (/rate limit/i.test(message)) return "試行回数が多すぎます。しばらく待ってからお試しください。";
  return message;
}

/**
 * Keeps local data in step with Supabase while signed in.
 * Local storage stays the source of truth for the UI; sync runs after edits, on focus and on demand.
 */
export function useSync(data: Data | null, setData: Dispatch<SetStateAction<Data | null>>): SyncState {
  const [user, setUser] = useState<SyncUser | null>(null);
  const [status, setStatus] = useState<SyncState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [rerun, setRerun] = useState(0);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** Data objects produced by sync itself — they must not schedule another sync. */
  const fromSync = useRef(new WeakSet<Data>());
  const running = useRef(false);
  const queued = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    const toUser = (u: { id: string; email?: string } | null | undefined) =>
      setUser((prev) => (u ? (prev?.id === u.id ? prev : { id: u.id, email: u.email ?? "" }) : null));
    supabase.auth.getSession().then(({ data }) => toUser(data.session?.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => toUser(session?.user));
    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = user?.id ?? null;

  const syncNow = useCallback(async () => {
    if (!supabase || !userId || !dataRef.current) return;
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    setStatus("syncing");
    try {
      const remote = await pull(supabase);
      const local = dataRef.current;
      const plan = merge(local, remote, Date.now());

      if (plan.changed) {
        fromSync.current.add(plan.data);
        // If the user edited during the pull, leave their state alone; the next run reconciles it.
        setData((current) => (current === local ? plan.data : current));
      }
      await push(supabase, plan.push);

      if (plan.settledTombstones.length > 0) {
        const settled = new Set(plan.settledTombstones.map(tombstoneKey));
        setData((current) => current && { ...current, tombstones: current.tombstones.filter((t) => !settled.has(tombstoneKey(t))) });
      }
      if (plan.download.length > 0) {
        const images = await downloadImages(supabase, plan.download.map((d) => d.id));
        setData(
          (current) =>
            current && {
              ...current,
              memos: current.memos.map((m) => {
                const incoming = images.filter(
                  (img) => img.memo_id === m.id && !img.deleted && !m.images.some((have) => have.id === img.id),
                );
                return incoming.length === 0
                  ? m
                  : { ...m, images: [...m.images, ...incoming.map((img) => ({ id: img.id, dataUrl: img.data_url }))] };
              }),
            },
        );
      }
      setLastSyncedAt(Date.now());
      setStatus("idle");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "同期に失敗しました。");
    } finally {
      running.current = false;
      if (queued.current) {
        queued.current = false;
        setRerun((n) => n + 1);
      }
    }
  }, [userId, setData]);

  // Sync right after sign-in / first load, and whenever a queued run is due.
  const loaded = data !== null;
  useEffect(() => {
    if (!userId || !loaded) return;
    const timer = setTimeout(() => void syncNow(), 0);
    return () => clearTimeout(timer);
  }, [userId, loaded, rerun, syncNow]);

  // Sync shortly after the user changes something.
  useEffect(() => {
    if (!userId || !data || fromSync.current.has(data)) return;
    const timer = setTimeout(() => void syncNow(), 2500);
    return () => clearTimeout(timer);
  }, [data, userId, syncNow]);

  // Pick up changes from other devices when coming back to the tab or back online.
  useEffect(() => {
    if (!userId) return;
    const onWake = () => document.visibilityState === "visible" && void syncNow();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [userId, syncNow]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authMessage(error.message));
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase!.auth.signUp({ email, password });
    if (error) throw new Error(authMessage(error.message));
    return data.session ? ("signed-in" as const) : ("confirm-email" as const);
  }, []);

  const signOut = useCallback(async () => {
    await supabase!.auth.signOut();
    setLastSyncedAt(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { configured: supabase !== null, user, status, error, lastSyncedAt, syncNow, signIn, signUp, signOut };
}
