"use client";
// Data layer: Supabase (Postgres + RLS) is the source of truth. React Query caches reads and the cache
// is persisted to localStorage so the app opens offline. Writes are applied optimistically and, when
// the network is unavailable, queued and replayed in order once connectivity returns.
import { QueryClient, QueryClientProvider, dehydrate, hydrate, useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { TableName } from "./types";

export type Op = "eq" | "neq" | "gte" | "lte" | "gt" | "lt" | "in" | "is";
export type Filter = [string, Op, unknown];
export interface RowQuery { table: TableName | "exercise_history"; select?: string; filters?: Filter[]; order?: [string, boolean?][]; limit?: number }

const CACHE_KEY = "forge-cache-v1";
const QUEUE_KEY = "forge-queue-v1";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * 24 * 3600_000, retry: 1, refetchOnWindowFocus: true, networkMode: "offlineFirst" } },
});

let currentUserId: string | null = null;
export const setCurrentUser = (id: string | null) => { currentUserId = id; };
export const uid = () => { if (!currentUserId) throw new Error("Not signed in"); return currentUserId; };

// ---------------------------------------------------------------- tiny store for sync status
type SyncState = { online: boolean; pending: number; syncing: boolean; lastError: string | null };
let sync: SyncState = { online: typeof navigator === "undefined" ? true : navigator.onLine, pending: 0, syncing: false, lastError: null };
const listeners = new Set<() => void>();
const setSync = (p: Partial<SyncState>) => { sync = { ...sync, ...p }; listeners.forEach((l) => l()); };
export const useSyncState = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sync, () => sync);

// ---------------------------------------------------------------- reads
export const keyOf = (q: RowQuery) => ["rows", q.table, JSON.stringify({ s: q.select, f: q.filters, o: q.order, l: q.limit })] as const;

async function fetchRows<T>(q: RowQuery): Promise<T[]> {
  let b = supabase.from(q.table).select(q.select || "*") as any;
  for (const [c, op, v] of q.filters || []) b = op === "in" ? b.in(c, v as unknown[]) : op === "is" ? b.is(c, v) : b[op](c, v);
  for (const [c, asc] of q.order || []) b = b.order(c, { ascending: asc !== false });
  b = b.limit(q.limit ?? 2000);
  const { data, error } = await b;
  if (error) throw error;
  return data as T[];
}

export function useRows<T>(q: RowQuery, enabled = true, opts?: { refetchInterval?: number; staleTime?: number }) {
  const r = useQuery({ queryKey: keyOf(q), queryFn: () => fetchRows<T>(q), enabled, refetchInterval: opts?.refetchInterval, ...(opts?.staleTime !== undefined ? { staleTime: opts.staleTime } : {}) });
  return { ...r, rows: (r.data || []) as T[] };
}

// ---------------------------------------------------------------- optimistic cache updates
function matches(row: Record<string, unknown>, filters: Filter[] = []) {
  return filters.every(([c, op, v]) => {
    const x = row[c] as never;
    switch (op) {
      case "eq": return x === v || String(x) === String(v);
      case "neq": return x !== v;
      case "gte": return x >= (v as never);
      case "lte": return x <= (v as never);
      case "gt": return x > (v as never);
      case "lt": return x < (v as never);
      case "in": return (v as unknown[]).includes(x);
      case "is": return x === v || (v === null && x == null);
    }
  });
}
const sameRow = (a: Record<string, unknown>, m: Record<string, unknown>) => Object.entries(m).every(([k, v]) => a[k] === v);

function patchCache(table: string, fn: (rows: Record<string, unknown>[], filters: Filter[], order?: [string, boolean?][]) => Record<string, unknown>[]) {
  for (const qq of queryClient.getQueryCache().findAll({ queryKey: ["rows", table] })) {
    const meta = JSON.parse(String(qq.queryKey[2])) as { f?: Filter[]; o?: [string, boolean?][] };
    const prev = (qq.state.data as Record<string, unknown>[] | undefined) || [];
    let next = fn(prev, meta.f || [], meta.o);
    if (meta.o?.length) {
      const [c, asc] = meta.o[0];
      next = [...next].sort((a, b) => { const x = a[c] as never, y = b[c] as never; return (x > y ? 1 : x < y ? -1 : 0) * (asc === false ? -1 : 1); });
    }
    queryClient.setQueryData(qq.queryKey, next);
  }
}

// ---------------------------------------------------------------- writes + offline queue
type QueueItem = { qid: string; op: "insert" | "update" | "delete" | "upsert"; table: string; payload?: unknown; match?: Record<string, unknown>; onConflict?: string };
const loadQueue = (): QueueItem[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
const saveQueue = (q: QueueItem[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage full or blocked */ } setSync({ pending: q.length }); };

const isNetworkError = (e: { message?: string } | null) => !navigator.onLine || /fetch|network|load failed|timeout/i.test(e?.message || "");

async function run(item: QueueItem) {
  const t = supabase.from(item.table);
  let res;
  if (item.op === "insert") res = await t.insert(item.payload as never);
  else if (item.op === "upsert") res = await t.upsert(item.payload as never, { onConflict: item.onConflict });
  else if (item.op === "update") { let b = t.update(item.payload as never) as any; for (const [k, v] of Object.entries(item.match!)) b = b.eq(k, v); res = await b; }
  else { let b = t.delete() as any; for (const [k, v] of Object.entries(item.match!)) b = b.eq(k, v); res = await b; }
  return res.error as { message: string; code?: string } | null;
}

let flushing = false;
export async function flushQueue() {
  if (flushing || typeof window === "undefined") return;
  flushing = true; setSync({ syncing: true });
  try {
    let q = loadQueue();
    const touched = new Set<string>();
    while (q.length) {
      const err = await run(q[0]);
      if (err && isNetworkError(err)) break;
      if (err) setSync({ lastError: `A queued change to ${q[0].table} was rejected: ${err.message}` });
      touched.add(q[0].table);
      q = q.slice(1); saveQueue(q);
    }
    touched.forEach((t) => queryClient.invalidateQueries({ queryKey: ["rows", t] }));
  } finally { flushing = false; setSync({ syncing: false }); }
}

async function write(item: Omit<QueueItem, "qid">) {
  const queued = loadQueue();
  // keep ordering: if anything is already queued, append behind it
  if (queued.length || !navigator.onLine) { saveQueue([...queued, { ...item, qid: crypto.randomUUID() }]); return { queued: true }; }
  const err = await run({ ...item, qid: "" });
  if (err && isNetworkError(err)) { saveQueue([...loadQueue(), { ...item, qid: crypto.randomUUID() }]); return { queued: true }; }
  if (err) { queryClient.invalidateQueries({ queryKey: ["rows", item.table] }); throw new Error(err.message); }
  queryClient.invalidateQueries({ queryKey: ["rows", item.table] });
  if (item.table === "workout_sets" || item.table === "workouts") queryClient.invalidateQueries({ queryKey: ["rows", "exercise_history"] });
  return { queued: false };
}

// tables whose rows aren't owned through a user_id column (ownership is expressed differently)
const NO_USER_ID = new Set(["profiles", "assignment_messages", "assignments", "notifications"]);
const withOwner = <T extends Record<string, unknown>>(table: string, r: T) =>
  table === "profiles" ? r : ({ id: crypto.randomUUID(), ...(NO_USER_ID.has(table) ? {} : { user_id: uid() }), ...r } as T & { id: string; user_id: string });

export async function insertRows<T extends Record<string, unknown>>(table: TableName, rows: T | T[]) {
  const list = (Array.isArray(rows) ? rows : [rows]).map((r) => withOwner(table, r) as T & { id: string; user_id: string });
  if (!list.length) return list;
  if (table === "food_favorites") list.forEach((r) => delete (r as Record<string, unknown>).id);
  patchCache(table, (prev, f) => [...prev, ...list.filter((r) => matches(r, f))]);
  await write({ op: "insert", table, payload: list });
  return list;
}

export async function upsertRow<T extends Record<string, unknown>>(table: TableName, row: T, onConflict: string) {
  const r = withOwner(table, row) as T & { id: string; user_id: string };
  const keys = onConflict.split(",");
  patchCache(table, (prev, f) => {
    const i = prev.findIndex((p) => keys.every((k) => p[k] === (r as Record<string, unknown>)[k]));
    const merged = i >= 0 ? { ...prev[i], ...r, id: prev[i].id ?? r.id } : r;
    const rest = i >= 0 ? prev.filter((_, j) => j !== i) : prev;
    return matches(merged, f) ? [...rest, merged] : rest;
  });
  // never overwrite the server id of an existing row with a new client id
  const payload = { ...r } as Record<string, unknown>;
  const existing = queryClient.getQueryCache().findAll({ queryKey: ["rows", table] })
    .flatMap((q) => (q.state.data as Record<string, unknown>[] | undefined) || [])
    .find((p) => keys.every((k) => p[k] === payload[k]));
  if (existing?.id) payload.id = existing.id;
  await write({ op: "upsert", table, payload, onConflict });
  return r;
}

export async function updateRows(table: TableName, match: Record<string, unknown>, patch: Record<string, unknown>) {
  patchCache(table, (prev, f) => prev.map((p) => (sameRow(p, match) ? { ...p, ...patch } : p)).filter((p) => !sameRow(p, match) || matches(p, f)));
  await write({ op: "update", table, payload: patch, match });
}

export async function deleteRows(table: TableName, match: Record<string, unknown>) {
  patchCache(table, (prev) => prev.filter((p) => !sameRow(p, match)));
  await write({ op: "delete", table, match });
}

export const updateById = (table: TableName, id: string, patch: Record<string, unknown>) => updateRows(table, { id }, patch);
export const deleteById = (table: TableName, id: string) => deleteRows(table, { id });

// ---------------------------------------------------------------- provider
export function clearLocalData() {
  try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
  queryClient.clear(); setSync({ pending: 0 });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(CACHE_KEY); if (raw) hydrate(queryClient, JSON.parse(raw)); } catch { /* corrupt cache */ }
    setSync({ pending: loadQueue().length, online: navigator.onLine });
    setReady(true);
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = queryClient.getQueryCache().subscribe(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(dehydrate(queryClient, { shouldDehydrateQuery: (q) => q.state.status === "success" }))); } catch { /* quota */ }
      }, 800);
    });
    const on = () => { setSync({ online: true }); flushQueue(); };
    const off = () => setSync({ online: false });
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const iv = setInterval(() => { if (navigator.onLine && loadQueue().length) flushQueue(); }, 20_000);
    flushQueue();
    return () => { unsub(); window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(iv); };
  }, []);
  if (!ready) return null;
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
