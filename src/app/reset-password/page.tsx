"use client";
// Landing page for the password-reset email link. Supabase puts a short-lived recovery session in the URL;
// supabase-js picks it up automatically, then the user chooses a new password here.
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input, Spinner } from "@/components/ui";

export default function ResetPassword() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Expired/used links come back with an error in the URL fragment or query.
    const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
    const urlErr = params.get("error_description");
    if (urlErr) { setReason(urlErr.replace(/\+/g, " ")); setState("invalid"); return; }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) setState("ready");
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setState("ready"); });
    const t = setTimeout(() => setState((s) => (s === "checking" ? "invalid" : s)), 6000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(/same/i.test(error.message) ? "That's your current password — choose a different one." : /weak|short|pwned|leaked/i.test(error.message) ? "That password is too weak or has appeared in a data breach. Try a longer, unique one." : error.message);
    setState("done");
    setTimeout(() => router.replace("/"), 1800);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="anim-rise w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3"><img src="/icons/icon.svg" alt="" className="size-10 rounded-xl" /><span className="font-display text-xl font-semibold">Forge</span></div>
        {state === "checking" && <div className="flex items-center gap-3 text-muted"><Spinner />Checking your reset link…</div>}
        {state === "invalid" && (
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Link expired</h1>
            <p className="mt-2 text-sm text-muted">{reason ?? "This reset link is invalid, already used, or has expired."} Reset links work once and only for a limited time — request a new one.</p>
            <Link href="/login"><Button variant="good" size="lg" className="mt-6 w-full">Request a new link</Button></Link>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={submit}>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Set a new password</h1>
            <p className="mb-6 mt-1 text-sm text-muted">Choose a password you don&apos;t use anywhere else.</p>
            <div className="space-y-3">
              <Field label="New password"><div className="relative"><Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input type={show ? "text" : "password"} autoFocus required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} className="pl-9 pr-10" />
                <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></Field>
              <Field label="Confirm new password"><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErr(null); }} className="pl-9" /></div></Field>
            </div>
            <p className="mt-2 text-xs text-faint">At least 8 characters.{pw && pw2 && pw !== pw2 ? " Passwords don't match yet." : ""}</p>
            {err && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
            <Button type="submit" variant="good" size="lg" className="mt-6 w-full" loading={busy}>Save new password</Button>
          </form>
        )}
        {state === "done" && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 size-12 text-good" />
            <h1 className="font-display text-2xl font-semibold">Password updated</h1>
            <p className="mt-1 text-sm text-muted">You&apos;re signed in. Taking you to your dashboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}
