"use client";
import { CalendarDays, Check, HelpCircle, ImagePlus, MapPin, Plus, Tent, Trash2, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth";
import { bannerUrl, isStaff, rsvp, uploadBanner, useRole } from "@/lib/coach";
import { SessionBanner } from "@/components/session-banner";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import type { GroupSession, SessionRsvp } from "@/lib/types";
import { Badge, Button, Card, Chip, cx, Empty, Field, Input, PageHeader, Segmented, Sheet, Textarea, useAction } from "@/components/ui";

export default function Page() { return <Suspense><Sessions /></Suspense>; }

const when = (s: GroupSession) => {
  const a = new Date(s.starts_at), b = new Date(s.ends_at);
  return `${a.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${a.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${b.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};
function Sessions() {
  const role = useRole();
  const staff = isStaff(role);
  const act = useAction();
  const sp = useSearchParams();
  const { session } = useSession();
  const me = session?.user.id;
  const sessions = useRows<GroupSession>({ table: "group_sessions", order: [["starts_at", true]], limit: 300 }, true, { refetchInterval: 60_000, staleTime: 0 });
  const rsvps = useRows<SessionRsvp>({ table: "session_rsvps", limit: 5000 }, true, { refetchInterval: 60_000, staleTime: 0 });
  const [tab, setTab] = useState<"upcoming" | "past" | "mine">("upcoming");
  const [openId, setOpenId] = useState<string | null>(sp.get("s"));
  const [creating, setCreating] = useState<GroupSession | "new" | null>(null);
  useEffect(() => { const s = sp.get("s"); if (s) setOpenId(s); }, [sp]);
  const now = new Date().toISOString();
  const list = useMemo(() => sessions.rows.filter((s) => tab === "upcoming" ? s.ends_at >= now : tab === "past" ? s.ends_at < now : s.created_by === me).sort((a, b) => (tab === "past" ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at))), [sessions.rows, tab, now, me]);
  const mine = (id: string) => rsvps.rows.find((r) => r.session_id === id && r.user_id === me);
  const count = (id: string, st = "going") => rsvps.rows.filter((r) => r.session_id === id && r.status === st).length;
  const sel = sessions.rows.find((s) => s.id === openId) ?? null;

  return (
    <div className="anim-rise">
      <PageHeader title="Group sessions" sub="Train together — beach CrossFit, park runs, yoga mornings." action={staff && <Button variant="good" icon={<Plus className="size-4" />} onClick={() => setCreating("new")}>New session</Button>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, ...(staff ? [{ value: "mine" as const, label: "Posted by me" }] : [])]} />
      {!list.length ? (
        <Card><Empty icon={<Tent className="size-5" />} title={tab === "upcoming" ? "No upcoming sessions" : "Nothing here yet"} body={staff ? "Post a session with a banner — members get notified and can RSVP." : "When your coach posts a group session, it shows up here."} action={staff && <Button onClick={() => setCreating("new")}>New session</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((s) => {
            const r = mine(s.id); const going = count(s.id); const full = s.capacity != null && going >= s.capacity && r?.status !== "going";
            return (
              <Card key={s.id} className="overflow-hidden p-0">
                <button className="block w-full text-left" onClick={() => setOpenId(s.id)}>
                  <SessionBanner s={s} className="h-44 rounded-none">
                    <div className="mb-1 flex flex-wrap gap-1.5">{s.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}{s.audience === "my_members" && <Badge>Members of {s.creator_name}</Badge>}{r && r.status !== "not_going" && <Badge tone="good">{r.status === "going" ? "You're going" : "Maybe"}</Badge>}</div>
                    <div className="font-display text-xl font-semibold leading-tight drop-shadow">{s.title}</div>
                  </SessionBanner>
                </button>
                <div className="space-y-1.5 p-4">
                  <div className="flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-faint" /><span className="num">{when(s)}</span></div>
                  {s.location && <div className="flex items-center gap-2 text-sm text-muted"><MapPin className="size-4 text-faint" />{s.location}</div>}
                  <div className="flex items-center gap-2 text-sm text-muted"><Users className="size-4 text-faint" />{going} going{count(s.id, "maybe") ? ` · ${count(s.id, "maybe")} maybe` : ""}{s.capacity ? ` · ${Math.max(0, s.capacity - going)} spots left` : ""} · by {s.creator_name ?? "coach"}</div>
                  {s.status === "scheduled" && s.ends_at >= now && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant={r?.status === "going" ? "good" : "secondary"} disabled={full} icon={<Check className="size-3.5" />} onClick={() => act(() => rsvp(s, "going", r), "You're in — added to your calendar")}>{full ? "Full" : "Going"}</Button>
                      <Button size="sm" variant={r?.status === "maybe" ? "warm" : "secondary"} icon={<HelpCircle className="size-3.5" />} onClick={() => act(() => rsvp(s, "maybe", r), "Marked maybe")}>Maybe</Button>
                      <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => act(() => rsvp(s, "not_going", r), "Got it")}>Can&apos;t go</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <SessionDetail s={sel} onClose={() => setOpenId(null)} rsvps={rsvps.rows.filter((r) => r.session_id === sel?.id)} canManage={!!sel && (sel.created_by === me || role === "admin")} onEdit={() => { setCreating(sel); setOpenId(null); }} />
      <SessionForm open={!!creating} initial={creating !== "new" ? creating : null} onClose={() => setCreating(null)} />
    </div>
  );
}

function SessionDetail({ s, onClose, rsvps, canManage, onEdit }: { s: GroupSession | null; onClose: () => void; rsvps: SessionRsvp[]; canManage: boolean; onEdit: () => void }) {
  const act = useAction();
  if (!s) return null;
  const by = (st: string) => rsvps.filter((r) => r.status === st);
  return (
    <Sheet open onClose={onClose} title={s.title} wide footer={canManage && <div className="flex flex-wrap gap-2">
      <Button onClick={onEdit}>Edit</Button>
      {s.status === "scheduled" ? <Button variant="ghost" onClick={() => act(async () => { await updateById("group_sessions", s.id, { status: "cancelled" }); onClose(); }, "Cancelled — attendees notified")}>Cancel session</Button>
        : <Button variant="ghost" onClick={() => act(() => updateById("group_sessions", s.id, { status: "scheduled" }), "Re-opened")}>Re-open</Button>}
      <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => act(async () => { await deleteById("group_sessions", s.id); onClose(); }, "Deleted")}>Delete</Button>
    </div>}>
      <SessionBanner s={s} className="mb-4 h-48"><div className="text-sm opacity-90">{when(s)}{s.location ? ` · ${s.location}` : ""}</div></SessionBanner>
      {s.description && <p className="mb-4 whitespace-pre-wrap text-[15px]">{s.description}</p>}
      <div className="grid grid-cols-3 gap-3 text-center">
        {(["going", "maybe", "not_going"] as const).map((st) => <div key={st} className="rounded-xl bg-bg-2 p-3"><div className="num text-2xl font-semibold">{by(st).length}</div><div className="text-xs text-faint">{st === "going" ? "Going" : st === "maybe" ? "Maybe" : "Can't go"}</div></div>)}
      </div>
      {by("going").length + by("maybe").length > 0 && <div className="mt-4"><div className="mb-1.5 text-[13px] font-medium text-muted">Who&apos;s going</div><div className="flex flex-wrap gap-1.5">{by("going").map((r) => <Badge key={r.user_id} tone="good">{r.user_name ?? "Member"}</Badge>)}{by("maybe").map((r) => <Badge key={r.user_id} tone="warm">{r.user_name ?? "Member"} (maybe)</Badge>)}</div></div>}
    </Sheet>
  );
}

function SessionForm({ open, initial, onClose }: { open: boolean; initial: GroupSession | null; onClose: () => void }) {
  const act = useAction();
  const local = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [f, setF] = useState({ title: "", description: "", location: "", start: "", minutes: "90", audience: "everyone" as "everyone" | "my_members", capacity: "" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(7, 0, 0, 0);
    setF(initial ? { title: initial.title, description: initial.description ?? "", location: initial.location ?? "", start: local(initial.starts_at), minutes: String(Math.round((new Date(initial.ends_at).getTime() - new Date(initial.starts_at).getTime()) / 60000)), audience: initial.audience, capacity: initial.capacity ? String(initial.capacity) : "" }
      : { title: "", description: "", location: "", start: local(tomorrow.toISOString()), minutes: "90", audience: "everyone", capacity: "" });
    setFile(null); setPreview(initial ? bannerUrl(initial.banner_path) : null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => act(async () => {
    const start = new Date(f.start); const end = new Date(start.getTime() + (Number(f.minutes) || 60) * 60000);
    const banner_path = file ? await uploadBanner(file) : initial?.banner_path ?? null;
    const row = { title: f.title.trim(), description: f.description.trim() || null, location: f.location.trim() || null, starts_at: start.toISOString(), ends_at: end.toISOString(), audience: f.audience, capacity: f.capacity ? Number(f.capacity) : null, banner_path };
    if (initial) await updateById("group_sessions", initial.id, row); else await insertRows("group_sessions", row);
    onClose();
  }, initial ? "Session updated" : "Session posted — members notified");
  return (
    <Sheet open={open} onClose={onClose} title={initial ? "Edit session" : "New group session"} wide footer={<Button variant="good" className="w-full" disabled={!f.title.trim() || !f.start} onClick={save}>{initial ? "Save changes" : "Post session"}</Button>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="block cursor-pointer">
            <div className="relative grid h-48 place-items-center overflow-hidden rounded-2xl border border-dashed border-line-2 bg-bg-2 text-center">
              {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="text-sm text-muted"><ImagePlus className="mx-auto mb-1 size-6" />Add a banner image<br /><span className="text-xs text-faint">JPG / PNG / WebP, up to 5 MB</span></div>}
              {preview && <span className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-1 text-xs text-white">Change</span>}
            </div>
            <input type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) { setFile(x); setPreview(URL.createObjectURL(x)); } e.target.value = ""; }} />
          </label>
          <p className="mt-2 text-xs text-faint">No image? A colourful gradient is used instead.</p>
        </div>
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Beach CrossFit 🏖️ — sunrise WOD" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts" className="col-span-2 sm:col-span-1"><Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Minutes"><Input inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field>
          </div>
          <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Juhu beach, near lifeguard tower 3" /></Field>
          <Field label="Who can see it"><div className="flex flex-wrap gap-1.5"><Chip active={f.audience === "everyone"} onClick={() => setF({ ...f, audience: "everyone" })}>Everyone</Chip><Chip active={f.audience === "my_members"} onClick={() => setF({ ...f, audience: "my_members" })}>Only my members</Chip></div></Field>
          <Field label="Spots (optional)"><Input inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} placeholder="No limit" /></Field>
        </div>
      </div>
      <Field label="Details" className="mt-4"><Textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={"Bring water + a towel.\n\nWOD: 5 rounds — 400 m sand run, 15 burpees, 20 kettlebell swings, 10 box jumps.\nCool-down swim (optional)."} /></Field>
    </Sheet>
  );
}
