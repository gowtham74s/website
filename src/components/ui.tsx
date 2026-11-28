"use client";
import clsx from "clsx";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";

export const cx = clsx;

// ---------------------------------------------------------------- layout
export function Card({ className, children, onClick, as = "div", id }: { className?: string; children: ReactNode; onClick?: () => void; as?: "div" | "button" | "section"; id?: string }) {
  const C = as as "div";
  return (
    <C id={id} onClick={onClick} className={cx("rounded-2xl border border-line bg-card", onClick && "cursor-pointer text-left transition hover:border-line-2 active:scale-[.995]", className)}>
      {children}
    </C>
  );
}

export function CardHeader({ title, icon, action, sub }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13px] font-medium text-muted">{icon}{title}</div>
        {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mb-6", className)}>
      {title && (
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- controls
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "good" | "warm"; size?: "sm" | "md" | "lg" | "xl"; loading?: boolean; icon?: ReactNode };
export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...p }: BtnProps) {
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]", size === "md" && "h-10 px-4 text-sm", size === "lg" && "h-12 px-5 text-[15px]", size === "xl" && "h-16 px-6 text-lg",
        variant === "primary" && "bg-fg text-bg hover:opacity-90",
        variant === "secondary" && "border border-line bg-card-2 text-fg hover:border-line-2",
        variant === "ghost" && "text-muted hover:bg-card-2 hover:text-fg",
        variant === "danger" && "bg-bad-soft text-bad hover:bg-bad/20",
        variant === "good" && "brand-bg text-black shadow-[0_8px_24px_-10px_rgba(46,245,157,.6)] hover:brightness-110",
        variant === "warm" && "bg-warm text-black hover:brightness-110",
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...p} className={cx("grid size-9 place-items-center rounded-xl text-muted transition hover:bg-card-2 hover:text-fg active:scale-95 disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className }: { label?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-xl border border-line bg-bg-2 px-3.5 py-2.5 text-fg placeholder:text-faint outline-none transition focus:border-line-2 focus:ring-2 focus:ring-good/25";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputCls, "resize-none", p.className)} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, "appearance-none pr-8", p.className)}>{children}</select>;

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cx("no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-bg-2 p-1", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx("shrink-0 rounded-lg font-medium transition", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]", value === o.value ? "bg-card-2 text-fg shadow-sm ring-1 ring-line-2" : "text-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, label, unit, big }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label?: string; unit?: string; big?: boolean }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div className="min-w-0">
      {label && <div className="mb-1.5 text-center text-xs font-medium text-faint">{label}</div>}
      <div className="flex items-center rounded-2xl border border-line bg-bg-2">
        <button type="button" aria-label={`Decrease ${label ?? ""}`} onClick={() => set(value - step)} className={cx("grid shrink-0 place-items-center text-muted active:scale-90", big ? "size-14" : "size-11")}><Minus className="size-5" /></button>
        <input inputMode="decimal" value={Number.isFinite(value) ? value : 0} onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); set(Number.isNaN(n) ? 0 : n); }}
          className={cx("num w-full min-w-0 bg-transparent text-center font-semibold outline-none", big ? "text-3xl" : "text-lg")} />
        {unit && <span className="-ml-1 mr-1 text-xs text-faint">{unit}</span>}
        <button type="button" aria-label={`Increase ${label ?? ""}`} onClick={() => set(value + step)} className={cx("grid shrink-0 place-items-center text-muted active:scale-90", big ? "size-14" : "size-11")}><Plus className="size-5" /></button>
      </div>
    </div>
  );
}

export function Scale({ value, onChange, max = 10, min = 1, lowLabel, highLabel, invert }: { value: number | null; onChange: (v: number) => void; max?: number; min?: number; lowLabel?: string; highLabel?: string; invert?: boolean }) {
  const n = max - min + 1;
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, i) => i + min).map((v) => {
          const on = value === v;
          const good = invert ? v <= Math.ceil(max / 3) : v > Math.floor((max * 2) / 3);
          const bad = invert ? v > Math.floor((max * 2) / 3) : v <= Math.ceil(max / 3);
          return (
            <button key={v} type="button" onClick={() => onChange(v)}
              className={cx("num h-10 rounded-lg border text-sm font-medium transition active:scale-95", on ? (good ? "border-good bg-good-soft text-good" : bad ? "border-bad/50 bg-bad-soft text-bad" : "border-warm/60 bg-warm-soft text-warm") : "border-line bg-bg-2 text-muted hover:text-fg")}>
              {v}
            </button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && <div className="mt-1 flex justify-between text-[11px] text-faint"><span>{lowLabel}</span><span>{highLabel}</span></div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-good" : "bg-line-2")}>
      <span className={cx("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: ReactNode; color?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition active:scale-95", active ? "border-transparent bg-fg text-bg" : "border-line bg-card-2 text-muted hover:text-fg")}
      style={active && color ? { background: color, color: "#000" } : undefined}>
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "good" | "warm" | "bad" | "info"; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
      tone === "neutral" && "bg-card-2 text-muted", tone === "good" && "bg-good-soft text-good", tone === "warm" && "bg-warm-soft text-warm", tone === "bad" && "bg-bad-soft text-bad", tone === "info" && "bg-info/15 text-info", className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- data viz primitives
export function Ring({ value, size = 120, stroke = 10, color, track = "var(--ring-track)", children, className }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; className?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  const col = color ?? (v >= 1 ? "var(--good)" : v >= 0.5 ? "var(--warm)" : "var(--muted)");
  return (
    <div className={cx("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="ring-anim -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Bar({ value, color, className, height = 6 }: { value: number; color?: string; className?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-[var(--ring-track)]", className)} style={{ height }}>
      <div className="bar-anim h-full rounded-full" style={{ width: `${v * 100}%`, background: color ?? (v >= 1 ? "var(--good)" : "var(--warm)") }} />
    </div>
  );
}

export function Metric({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: "good" | "warm" | "bad" }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-faint">{label}</div>
      <div className={cx("num mt-0.5 truncate text-xl font-semibold tracking-tight", tone === "good" && "text-good", tone === "warm" && "text-warm", tone === "bad" && "text-bad")}>
        {value}{unit && <span className="ml-0.5 text-sm font-medium text-faint">{unit}</span>}
      </div>
      {sub && <div className="truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function MacroBar({ label, value, target, color, unit = "g" }: { label: string; value: number; target: number; color: string; unit?: string }) {
  const over = target > 0 && value > target * 1.1;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="num text-faint"><span className={cx("font-semibold", over ? "text-bad" : "text-fg")}>{Math.round(value)}</span> / {target}{unit}</span>
      </div>
      <Bar value={target ? value / target : 0} color={over ? "var(--bad)" : color} />
    </div>
  );
}

// ---------------------------------------------------------------- states
export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-card-2 text-muted">{icon}</div>}
      <div className="font-medium">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cx("animate-pulse rounded-xl bg-card-2", className)} />;

export function Spinner({ className }: { className?: string }) { return <Loader2 className={cx("size-5 animate-spin text-muted", className)} />; }

// ---------------------------------------------------------------- sheet / modal
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cx("anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-card shadow-2xl sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <div className="text-lg font-semibold tracking-tight">{title}</div>
          <IconButton label="Close" onClick={onClose}><X className="size-5" /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="safe-b border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = "Delete", danger = true }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></div>}>
      {body && <p className="text-sm text-muted">{body}</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- toasts (with undo)
type Toast = { id: number; msg: ReactNode; tone: "good" | "bad" | "info"; undo?: () => void };
const ToastCtx = createContext<(msg: ReactNode, opts?: { tone?: Toast["tone"]; undo?: () => void }) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((msg: ReactNode, opts?: { tone?: Toast["tone"]; undo?: () => void }) => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-2), { id, msg, tone: opts?.tone ?? "good", undo: opts?.undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.undo ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="anim-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-2 bg-card-2 py-2.5 pl-4 pr-2 text-sm shadow-2xl">
            <span className={cx("size-2 shrink-0 rounded-full", t.tone === "good" ? "bg-good" : t.tone === "bad" ? "bg-bad" : "bg-info")} />
            <span className="min-w-0 flex-1">{t.msg}</span>
            {t.undo && <button className="rounded-lg px-2.5 py-1 font-semibold text-warm hover:bg-warm-soft" onClick={() => { t.undo!(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>Undo</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Wrap an async action with error toast. */
export function useAction() {
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, success?: ReactNode, undo?: () => void) => {
    try { const r = await fn(); if (success) toast(success, { undo }); return r; }
    catch (e) { toast((e as Error).message || "Something went wrong", { tone: "bad" }); return undefined; }
  }, [toast]);
}
