"use client";

import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
  useState,
} from "react";
import { X } from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  className,
  titleClassName,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60 sm:p-5",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title ? (
              <h2 className={cx("text-base font-semibold text-slate-900", titleClassName)}>
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-teal-700 text-white hover:bg-teal-800",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "ghost" && "bg-transparent text-slate-700 hover:bg-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  label,
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      {label ? <span className="font-medium text-slate-700">{label}</span> : null}
      <input
        type={type}
        className={cx(
          "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-teal-600/30 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 sm:text-sm",
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function TextArea({
  label,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      {label ? <span className="font-medium text-slate-700">{label}</span> : null}
      <textarea
        className={cx(
          "min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-teal-600/30 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 sm:text-sm",
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function Select({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      {label ? <span className="font-medium text-slate-700">{label}</span> : null}
      <select
        className={cx(
          "rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-600/30 focus:border-teal-600 focus:ring-2",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "teal" | "amber" | "rose" | "sky" | "emerald";
}) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "slate" && "bg-slate-200 text-slate-700",
        tone === "teal" && "bg-teal-100 text-teal-800",
        tone === "amber" && "bg-amber-100 text-amber-800",
        tone === "rose" && "bg-rose-100 text-rose-800",
        tone === "sky" && "bg-sky-100 text-sky-800",
        tone === "emerald" && "bg-emerald-100 text-emerald-800",
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function isImageSrc(src: string) {
  return (
    src.startsWith("data:image/") ||
    /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(src) ||
    src.includes("image/")
  );
}

export function PhotoLightbox({
  src,
  title,
  onClose,
}: {
  src: string | null;
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title || "Photo preview"}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-800">{title || "Photo"}</p>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Close photo">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[80vh] overflow-auto bg-slate-100 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={title || "Photo"} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

export function PhotoThumbGrid({
  items,
  emptyLabel = "No photos yet",
}: {
  items: Array<{ id: string; src: string; title: string }>;
  emptyLabel?: string;
}) {
  const [active, setActive] = useState<{ src: string; title: string } | null>(null);

  if (!items.length) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const image = isImageSrc(item.src);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive({ src: item.src, title: item.title })}
              className="block overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-teal-400"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.src} alt={item.title} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center px-2 text-center text-xs text-teal-700">
                  {item.title}
                </div>
              )}
              <p className="truncate px-2 py-1 text-xs text-slate-600">{item.title}</p>
            </button>
          );
        })}
      </div>
      <PhotoLightbox
        src={active?.src ?? null}
        title={active?.title}
        onClose={() => setActive(null)}
      />
    </>
  );
}
