"use client";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldAlert, ShieldCheck, Shuffle, Trash2, UserCog, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useSession } from "@/lib/auth";
import { adminDeleteUser, assignCoach, assignCoachBulk, autoDivideMembers, ROLE_LABEL, useRole } from "@/lib/coach";
import { queryClient } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";
import { Avatar } from "@/components/vibe";
import { Badge, Button, Card, cx, Empty, Field, IconButton, Input, PageHeader, Segmented, Select, Sheet, Spinner, useAction } from "@/components/ui";

type U = { id: string; email: string; name: string | null; role: Role; coach_id: string | null; coach_name: string | null; avatar_emoji: string | null; avatar_color: string | null; created_at: string; last_sign_in_at: string | null };

export default function AdminPage() {
  const role = useRole();
  const act = useAction();
  const { session } = useSession();
  const me = session?.user.id;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Role | "free">("all");
  const [sel, setSel] = useState<string[]>([]);
  const [bulkCoach, setBulkCoach] = useState("");
  const [del, setDel] = useState<U | null>(null);
  const [confirm, setConfirm] = useState("");
  const users = useQuery({
    queryKey: ["admin_users"], enabled: role === "admin",
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_list_users"); if (error) throw error; return (data || []) as U[]; },
  });
  const all = users.data ?? [];
  const coaches = all.filter((u) => u.role === "coach" || u.role === "admin");
  const load = useMemo(() => Object.fromEntries(coaches.map((c) => [c.id, all.filter((u) => u.coach_id === c.id).length])), [all, coaches]);
  if (role !== "admin") return <Card className="mt-6"><Empty icon={<ShieldAlert className="size-5" />} title="Admins only" body="Only an admin can manage roles and accounts." /></Card>;
  const list = all.filter((u) => (filter === "all" || (filter === "free" ? u.role === "user" && !u.coach_id : u.role === filter)) && `${u.name ?? ""} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const count = (r: Role) => all.filter((u) => u.role === r).length;
  const freeCount = all.filter((u) => u.role === "user" && !u.coach_id).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin_users"] });
  const setRole = (u: U, r: Role) => act(async () => {
    const { error } = await supabase.rpc("set_user_role", { p_user: u.id, p_role: r });
    if (error) throw error;
    await refresh();
    if (u.id === me) queryClient.invalidateQueries({ queryKey: ["rows", "profiles"] });
  }, `${u.name || u.email} is now ${r === "admin" ? "an Admin" : `a ${ROLE_LABEL[r]}`}`);

  return (
    <div className="anim-rise pb-24">
      <PageHeader title="Admin" sub={`${all.length} accounts · ${count("admin")} admin · ${count("coach")} coach · ${count("user")} member${count("user") === 1 ? "" : "s"} · ${freeCount} without a coach`}
        action={<Button variant="good" icon={<Shuffle className="size-4" />} disabled={!freeCount || !all.some((u) => u.role === "coach")} onClick={() => act(async () => { const n = await autoDivideMembers(); return n; }, "Free members divided evenly between coaches")}>Divide free members</Button>} />

      {coaches.length > 0 && (
        <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
          {coaches.map((c) => (
            <Card key={c.id} className="flex shrink-0 items-center gap-2.5 px-3 py-2">
              <Avatar name={c.name} emoji={c.avatar_emoji} color={c.avatar_color} size={30} />
              <div><div className="text-sm font-medium">{c.name || c.email}</div><div className="text-xs text-faint">{ROLE_LABEL[c.role]} · {load[c.id] ?? 0} member{load[c.id] === 1 ? "" : "s"}</div></div>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "user", label: "Members" }, { value: "free", label: `No coach (${freeCount})` }, { value: "coach", label: "Coaches" }, { value: "admin", label: "Admins" }]} />
      </div>

      {users.isLoading ? <Spinner /> : users.error ? <Card className="p-4 text-sm text-bad">{(users.error as Error).message}</Card> : (
        <Card className="divide-y divide-line">
          {list.map((u) => (
            <div key={u.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3", sel.includes(u.id) && "bg-good-soft")}>
              {u.role === "user" ? <input type="checkbox" aria-label={`Select ${u.email}`} className="size-4 accent-[var(--good)]" checked={sel.includes(u.id)} onChange={() => setSel(sel.includes(u.id) ? sel.filter((x) => x !== u.id) : [...sel, u.id])} /> : <span className="w-4" />}
              <Avatar name={u.name} emoji={u.avatar_emoji} color={u.avatar_color} size={34} />
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2 font-medium">{u.name || "—"}{u.id === me && <Badge>you</Badge>}</div>
                <div className="truncate text-xs text-faint">{u.email} · joined {new Date(u.created_at).toLocaleDateString()}{u.last_sign_in_at ? ` · last sign-in ${new Date(u.last_sign_in_at).toLocaleDateString()}` : ""}</div>
              </div>
              {u.role === "user" && (
                <div className="w-44 shrink-0"><Select aria-label={`Coach for ${u.email}`} value={u.coach_id ?? ""} className="py-2 text-sm"
                  onChange={(e) => act(() => assignCoach(u.id, e.target.value || null), e.target.value ? "Coach assigned" : "Coach removed")}>
                  <option value="">No coach</option>
                  {coaches.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
                </Select></div>
              )}
              <div className="flex gap-1 rounded-xl border border-line bg-bg-2 p-1" role="radiogroup" aria-label={`Role for ${u.email}`}>
                {(["user", "coach", "admin"] as Role[]).map((r) => (
                  <button key={r} role="radio" aria-checked={u.role === r} onClick={() => u.role !== r && setRole(u, r)}
                    className={cx("rounded-lg px-3 py-1.5 text-xs font-medium transition", u.role === r ? (r === "admin" ? "bg-bad-soft text-bad" : r === "coach" ? "bg-info/15 text-info" : "bg-card-2 text-fg") : "text-muted hover:text-fg")}>{ROLE_LABEL[r]}</button>
                ))}
              </div>
              <IconButton label={`Delete ${u.email}`} disabled={u.id === me} onClick={() => { setDel(u); setConfirm(""); }} className="hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" /></IconButton>
            </div>
          ))}
          {!list.length && <div className="p-6 text-center text-sm text-muted">No accounts match.</div>}
        </Card>
      )}

      <Card className="mt-4 flex gap-3 p-4 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
        <div><b className="text-fg">Member</b> — their own data. <b className="text-fg">Coach</b> — coaches their assigned members: events, reminders, daily progress; can claim free members and hand their members to another coach, but never take another coach&apos;s member. <b className="text-fg">Admin</b> — everything, plus roles, coach assignment and deleting accounts. All enforced by the database.</div></Card>

      {sel.length > 0 && (
        <div className="safe-b fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6 lg:left-64">
          <Card className="flex flex-wrap items-center gap-2 border-good/40 p-3 shadow-2xl">
            <Users className="size-4 text-good" /><span className="text-sm font-medium">{sel.length} selected</span>
            <div className="w-48"><Select value={bulkCoach} onChange={(e) => setBulkCoach(e.target.value)} className="py-2 text-sm"><option value="">Choose coach…</option><option value="__none">No coach (release)</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name || c.email} ({load[c.id] ?? 0})</option>)}</Select></div>
            <Button size="sm" variant="good" disabled={!bulkCoach} icon={<UserCog className="size-4" />} onClick={() => act(async () => { await assignCoachBulk(sel, bulkCoach === "__none" ? null : bulkCoach); setSel([]); setBulkCoach(""); }, "Assigned")}>Assign</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
          </Card>
        </div>
      )}

      <Sheet open={!!del} onClose={() => setDel(null)} title="Delete account?" footer={<Button variant="danger" className="w-full" disabled={confirm.trim().toLowerCase() !== (del?.email ?? "").toLowerCase()} onClick={() => act(async () => { await adminDeleteUser(del!.id); setDel(null); }, "Account deleted")}>Permanently delete</Button>}>
        {del && <>
          <div className="mb-3 flex items-center gap-3"><Avatar name={del.name} emoji={del.avatar_emoji} color={del.avatar_color} size={40} /><div><div className="font-medium">{del.name || "—"}</div><div className="text-sm text-faint">{del.email} · {ROLE_LABEL[del.role]}</div></div></div>
          <p className="text-sm text-muted">This permanently deletes the account and <b className="text-fg">all of its data</b> — logs, workouts, sleep, events, messages and photos. Members they coached become free. This can&apos;t be undone.</p>
          <Field label={`Type ${del.email} to confirm`} className="mt-4"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
        </>}
      </Sheet>
    </div>
  );
}
