import type { Data, Layout, Memo, Project, Tombstone } from "./store";

/** Row shapes as stored in Supabase. */
export type RemoteProject = { id: string; name: string; kana: string; updated_at: number; deleted: boolean };
export type RemoteMemo = {
  id: string;
  project_id: string | null;
  body: string;
  kana: string;
  summary: { text: string; kana: string } | null;
  /** Absent when the server table has no `layout` column yet (see supabase/schema.sql). */
  layout?: Layout | null;
  updated_at: number;
  deleted: boolean;
};
export type RemoteImageMeta = { id: string; memo_id: string; updated_at: number; deleted: boolean };
export type RemoteImage = RemoteImageMeta & { data_url: string };

export type Remote = { projects: RemoteProject[]; memos: RemoteMemo[]; images: RemoteImageMeta[] };

export type Plan = {
  /** Local data after taking in everything newer from the server. */
  data: Data;
  /** True when `data` differs from the local input. */
  changed: boolean;
  /** Rows to upsert because the local copy is newer (or a local deletion). */
  push: { projects: RemoteProject[]; memos: RemoteMemo[]; images: RemoteImage[] };
  /** Images that exist on the server but not here yet. */
  download: { id: string; memoId: string }[];
  /** Local deletion records that are settled once `push` succeeds. */
  settledTombstones: Tombstone[];
};

type LocalRow = { id: string; updatedAt: number };
type RemoteRow = { id: string; updated_at: number; deleted: boolean };

/** Last-write-wins merge of one table, keyed by id and compared by timestamp. */
function mergeTable<L extends LocalRow, R extends RemoteRow>(
  locals: L[],
  remotes: R[],
  tombstones: Map<string, number>,
  toRemote: (local: L) => R,
  fromRemote: (remote: R, existing?: L) => L,
  toDeleted: (id: string, at: number) => R,
) {
  const remoteById = new Map(remotes.map((r) => [r.id, r]));
  const localIds = new Set(locals.map((l) => l.id));
  const items: L[] = [];
  const push: R[] = [];
  let changed = false;

  for (const local of locals) {
    const remote = remoteById.get(local.id);
    if (!remote || local.updatedAt > remote.updated_at) {
      items.push(local);
      push.push(toRemote(local));
    } else if (remote.deleted) {
      changed = true; // deleted on another device
    } else if (remote.updated_at > local.updatedAt) {
      items.push(fromRemote(remote, local));
      changed = true;
    } else {
      items.push(local);
    }
  }

  for (const remote of remotes) {
    if (localIds.has(remote.id) || remote.deleted) continue;
    const deletedAt = tombstones.get(remote.id);
    if (deletedAt !== undefined && deletedAt >= remote.updated_at) {
      push.push(toDeleted(remote.id, deletedAt));
    } else {
      // New from another device — or edited there after we deleted it, in which case the edit wins.
      items.push(fromRemote(remote));
      changed = true;
    }
  }
  return { items, push, changed };
}

const projectToRemote = (p: Project): RemoteProject => ({
  id: p.id,
  name: p.name,
  kana: p.kana,
  updated_at: p.updatedAt,
  deleted: false,
});

const memoToRemote = (m: Memo): RemoteMemo => ({
  id: m.id,
  project_id: m.projectId,
  body: m.body,
  kana: m.kana,
  summary: m.summary ?? null,
  layout: m.layout ?? null,
  updated_at: m.updatedAt,
  deleted: false,
});

/**
 * Work out how to reconcile this device with the server. Pure: performs no I/O.
 * The caller applies `data`, upserts `push`, fetches `download`, then drops `settledTombstones`.
 */
export function merge(local: Data, remote: Remote, now: number): Plan {
  const tombstonesFor = (table: Tombstone["table"]) =>
    new Map(local.tombstones.filter((t) => t.table === table).map((t) => [t.id, t.at]));
  let changed = false;

  // --- projects ---
  // A never-edited default project (updatedAt 0) is dropped rather than duplicated on every new device.
  const remoteHasProjects = remote.projects.some((r) => !r.deleted);
  const localProjects: Project[] = [];
  for (const p of local.projects) {
    if (p.updatedAt !== 0) localProjects.push(p);
    else if (remoteHasProjects && !local.memos.some((m) => m.projectId === p.id)) changed = true;
    else {
      localProjects.push({ ...p, updatedAt: now });
      changed = true;
    }
  }
  const projects = mergeTable<Project, RemoteProject>(
    localProjects,
    remote.projects,
    tombstonesFor("projects"),
    projectToRemote,
    (r) => ({ id: r.id, name: r.name, kana: r.kana, updatedAt: r.updated_at }),
    (id, at) => ({ id, name: "", kana: "", updated_at: at, deleted: true }),
  );
  if (projects.items.length === 0) {
    const fallback: Project = { id: crypto.randomUUID(), name: "メモ", kana: "めも", updatedAt: now };
    projects.items.push(fallback);
    projects.push.push(projectToRemote(fallback));
    projects.changed = true;
  }

  // --- memos ---
  const memos = mergeTable<Memo, RemoteMemo>(
    local.memos,
    remote.memos,
    tombstonesFor("memos"),
    memoToRemote,
    (r, existing) => ({
      id: r.id,
      projectId: r.project_id ?? "",
      body: r.body,
      kana: r.kana,
      summary: r.summary ?? undefined,
      layout: "layout" in r ? (r.layout ?? undefined) : existing?.layout,
      images: existing?.images ?? [],
      updatedAt: r.updated_at,
    }),
    (id, at) => ({ id, project_id: null, body: "", kana: "", summary: null, layout: null, updated_at: at, deleted: true }),
  );

  // A memo whose project was deleted elsewhere would be unreachable: move it to the first project.
  const projectIds = new Set(projects.items.map((p) => p.id));
  memos.items = memos.items.map((m) => {
    if (projectIds.has(m.projectId)) return m;
    const moved = { ...m, projectId: projects.items[0].id, updatedAt: now };
    memos.push = [...memos.push.filter((r) => r.id !== m.id), memoToRemote(moved)];
    memos.changed = true;
    return moved;
  });

  // --- images (immutable: only ever added or deleted) ---
  const remoteImages = new Map(remote.images.map((r) => [r.id, r]));
  const imageTombstones = tombstonesFor("memo_images");
  const localImageIds = new Set<string>();
  const pushImages: RemoteImage[] = [];
  const finalMemos = memos.items.map((m) => {
    const kept = m.images.filter((img) => {
      localImageIds.add(img.id);
      const r = remoteImages.get(img.id);
      if (r?.deleted) return false;
      if (!r) pushImages.push({ id: img.id, memo_id: m.id, data_url: img.dataUrl, updated_at: now, deleted: false });
      return true;
    });
    if (kept.length === m.images.length) return m;
    changed = true;
    return { ...m, images: kept };
  });

  const memoIds = new Set(finalMemos.map((m) => m.id));
  const download: Plan["download"] = [];
  for (const r of remote.images) {
    if (r.deleted || localImageIds.has(r.id)) continue;
    const deletedAt = imageTombstones.get(r.id);
    if (deletedAt !== undefined || !memoIds.has(r.memo_id)) {
      // Removed here, or left behind by a memo that no longer exists.
      pushImages.push({ id: r.id, memo_id: r.memo_id, data_url: "", updated_at: Math.max(now, r.updated_at), deleted: true });
    } else {
      download.push({ id: r.id, memoId: r.memo_id });
    }
  }

  return {
    data: { projects: projects.items, memos: finalMemos, tombstones: local.tombstones },
    changed: changed || projects.changed || memos.changed,
    push: { projects: projects.push, memos: memos.push, images: pushImages },
    download,
    settledTombstones: local.tombstones,
  };
}
