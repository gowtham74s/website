"use client";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/auth";
import { useRole } from "@/lib/coach";
import { queryClient } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";
import { Badge, Card, cx, Empty, Input, PageHeader, Segmented, Spinner, useAction } from "@/components/ui";

type U = { id: string; email: string; name: string | null; role: Role; created_at: string; last_sign_in_at: string | null };

export default function AdminPage() {
  const role = useRole();
  const act = useAction();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Role>("all");
  const users = useQuery({
    queryKey: ["admin_users"], enabled: role === "admin",
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_list_users"); if (error) throw error; return (data || []) as U[]; },
  });
  if (role !== "admin") return <Card className="mt-6"><Empty icon={<ShieldAlert className="size-5" />} title="Admins only" body="Only an admin can manage roles." /></Card>;
  const list = (users.data ?? []).filter((u) => (filter === "all" || u.role === filter) && `${u.name ?? ""} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const count = (r: Role) => (users.data ?? []).filter((u) => u.role === r).length;
  const setRole = (u: U, r: Role) => act(async () => {
    const { error } = await supabase.rpc("set_user_role", { p_user: u.id, p_role: r });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["admin_users"] });
    if (u.id === session?.user.id) queryClient.invalidateQueries({ queryKey: ["rows", "profiles"] });
  }, `${u.name || u.email} is now ${r === "admin" ? "an admin" : `a ${r}`}`);
  return (
    <div className="anim-rise">
      <PageHeader title="Admin" sub={`${users.data?.length ?? 0} accounts · ${count("admin")} admin · ${count("coach")} coach · ${count("user")} user`} />
      <Card className="mb-4 flex gap-3 p-4 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
        <div><b className="text-fg">User</b> — their own data only. <b className="text-fg">Coach</b> — can send events to any user, see each user&apos;s daily totals and send reminders. <b className="text-fg">Admin</b> — everything a coach can do, plus manage roles. Role changes are enforced by the database.</div></Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "user", label: "Users" }, { value: "coach", label: "Coaches" }, { value: "admin", label: "Admins" }]} />
      </div>
      {users.isLoading ? <Spinner /> : users.error ? <Card className="p-4 text-sm text-bad">{(users.error as Error).message}</Card> : (
        <Card className="divide-y divide-line">
          {list.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">{u.name || "—"}{u.id === session?.user.id && <Badge>you</Badge>}</div>
                <div className="truncate text-xs text-faint">{u.email} · joined {new Date(u.created_at).toLocaleDateString()}{u.last_sign_in_at ? ` · last sign-in ${new Date(u.last_sign_in_at).toLocaleDateString()}` : ""}</div>
              </div>
              <div className="flex gap-1 rounded-xl border border-line bg-bg-2 p-1" role="radiogroup" aria-label={`Role for ${u.email}`}>
                {(["user", "coach", "admin"] as Role[]).map((r) => (
                  <button key={r} role="radio" aria-checked={u.role === r} onClick={() => u.role !== r && setRole(u, r)}
                    className={cx("rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition", u.role === r ? (r === "admin" ? "bg-bad-soft text-bad" : r === "coach" ? "bg-info/15 text-info" : "bg-card-2 text-fg") : "text-muted hover:text-fg")}>{r}</button>
                ))}
              </div>
            </div>
          ))}
          {!list.length && <div className="p-6 text-center text-sm text-muted">No accounts match.</div>}
        </Card>
      )}
    </div>
  );
}
