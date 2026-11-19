import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Remote, RemoteImage, Plan } from "./merge";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null until the project is configured in .env.local — the app then stays local-only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

const PAGE = 1000;
const MEMO_COLUMNS = "id,project_id,body,kana,summary,updated_at,deleted";
/** Turns false if the server's memos table predates the `layout` column; text sync then carries on without it. */
let hasLayoutColumn = true;

async function fetchMemos(client: SupabaseClient): Promise<Remote["memos"]> {
  if (hasLayoutColumn) {
    try {
      return await fetchAll(client, "memos", `${MEMO_COLUMNS},layout`);
    } catch (e) {
      if (!/layout/.test(String(e))) throw e;
      hasLayoutColumn = false;
    }
  }
  return fetchAll(client, "memos", MEMO_COLUMNS);
}

async function fetchAll<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Everything the signed-in user has on the server (image contents excluded). */
export async function pull(client: SupabaseClient): Promise<Remote> {
  const [projects, memos, images] = await Promise.all([
    fetchAll<Remote["projects"][number]>(client, "projects", "id,name,kana,updated_at,deleted"),
    fetchMemos(client),
    fetchAll<Remote["images"][number]>(client, "memo_images", "id,memo_id,updated_at,deleted"),
  ]);
  return { projects, memos, images };
}

async function upsert(client: SupabaseClient, table: string, rows: object[], chunk: number) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + chunk));
    if (error) throw new Error(error.message);
  }
}

export async function push(client: SupabaseClient, rows: Plan["push"]): Promise<void> {
  await upsert(client, "projects", rows.projects, 200);
  const memos = hasLayoutColumn
    ? rows.memos
    : rows.memos.map((row) => {
        const copy = { ...row };
        delete copy.layout;
        return copy;
      });
  await upsert(client, "memos", memos, 100);
  await upsert(client, "memo_images", rows.images, 1); // images are large: one request each
}

export async function downloadImages(client: SupabaseClient, ids: string[]): Promise<RemoteImage[]> {
  const rows: RemoteImage[] = [];
  for (let i = 0; i < ids.length; i += 4) {
    const { data, error } = await client
      .from("memo_images")
      .select("id,memo_id,data_url,updated_at,deleted")
      .in("id", ids.slice(i, i + 4));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as RemoteImage[]));
  }
  return rows.sort((a, b) => a.updated_at - b.updated_at);
}
