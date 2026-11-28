"use client";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input, Segmented } from "@/components/ui";
import { MotionBackground, SloganTicker } from "@/components/vibe";

export default function Login() {
  const router = useRouter();
  const { session } = useSession();
  const [mode, setMode] = useState<"signin" | "signup" | "magic" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  useEffect(() => { if (session) router.replace("/"); }, [session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const redirect = `${location.origin}/`;
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` });
      setBusy(false);
      if (error && /rate limit/i.test(error.message)) return setMsg({ tone: "bad", text: "Too many emails sent recently. Please try again in about an hour." });
      if (error && !/not found|user/i.test(error.message)) return setMsg({ tone: "bad", text: error.message });
      // same message whether or not the account exists, so emails can't be probed
      return setMsg({ tone: "good", text: "If an account exists for that email, a reset link is on its way. Open it on this device to set a new password. Check spam if it doesn't arrive in a few minutes." });
    }
    const res = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password })
      : mode === "signup" ? await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirect } })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (res.error) {
      const m = res.error.message;
      if (/rate limit/i.test(m)) return setMsg({ tone: "bad", text: mode === "magic" ? "Too many emails sent recently. Use the Sign in tab with your password instead, or try the email link again in about an hour." : "Too many emails sent recently. If you already have an account, use Sign in with your password; otherwise try again in about an hour." });
      if (/invalid login credentials/i.test(m)) return setMsg({ tone: "bad", text: "Email or password is incorrect. If you only ever used an email link, set a password via Sign up with the same email or use Email link." });
      if (/email not confirmed/i.test(m)) return setMsg({ tone: "bad", text: "Please confirm your email first — check your inbox for the confirmation link." });
      return setMsg({ tone: "bad", text: m });
    }
    if (mode === "magic") setMsg({ tone: "good", text: "Check your inbox for a sign-in link." });
    else if (mode === "signup" && res.data.user && !res.data.user.identities?.length) setMsg({ tone: "bad", text: "An account with this email already exists. Use Sign in with your password." });
    else if (mode === "signup" && !res.data.session) setMsg({ tone: "good", text: "Account created. Confirm your email, then sign in." });
  };

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <MotionBackground />
      <div className="hero-grad relative z-10 hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <div className="flex items-center gap-3"><img src="/icons/icon.svg" alt="" className="size-10 rounded-xl" /><span className="font-display text-xl font-semibold">Forge</span></div>
        <div>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight">Your daily<br /><span className="brand-text">command center.</span></h1>
          <SloganTicker className="mt-4 block text-xl" />
          <p className="mt-5 max-w-md text-lg text-muted">Training, nutrition, hydration, sleep, habits and your schedule — one honest view of what to do today and whether it&apos;s working.</p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm text-muted">
          <div><div className="num text-2xl font-semibold text-good">RLS</div>Private by default</div>
          <div><div className="num text-2xl font-semibold text-warm">Offline</div>Logs sync later</div>
          <div><div className="num text-2xl font-semibold text-fg">PWA</div>Install on phone</div>
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-center px-5 py-12">
        <form onSubmit={submit} className="w-full max-w-sm anim-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><img src="/icons/icon.svg" alt="" className="size-10 rounded-xl" /><span className="font-display text-xl font-semibold">Forge</span></div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h2>
          <p className="mb-6 mt-1 text-sm text-muted">{mode === "forgot" ? "Enter your account email and we'll send you a link to set a new password." : "Your data is private to your account."}</p>
          {mode !== "forgot" && <Segmented className="mb-5 w-full" value={mode} onChange={setMode} options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Sign up" }, { value: "magic", label: "Email link" }]} />}
          <div className="space-y-3">
            {mode === "signup" && <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
            <Field label="Email"><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" autoComplete="email" /></div></Field>
            {(mode === "signin" || mode === "signup") && <Field label="Password"><div className="relative"><Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div></Field>}
          </div>
          {mode === "signin" && <button type="button" onClick={() => { setMode("forgot"); setMsg(null); }} className="mt-2 text-sm font-medium text-good hover:underline">Forgot password?</button>}
          {mode === "forgot" && <button type="button" onClick={() => { setMode("signin"); setMsg(null); }} className="mt-2 text-sm text-muted hover:text-fg">← Back to sign in</button>}
          {mode === "magic" && <p className="mt-3 text-xs text-faint">Email links are limited to a few per hour. Signing in with a password never sends email.</p>}
          {msg && <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.tone === "good" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
          <Button type="submit" variant="good" size="lg" className="mt-6 w-full" loading={busy}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Send link"}<ArrowRight className="size-4" /></Button>
        </form>
      </div>
    </div>
  );
}
