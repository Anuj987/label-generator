"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/providers/app-provider";
import { Button, Input, SectionCard } from "@/components/ui";
import type { Role } from "@/lib/types";

const HOME: Record<Role, string> = {
  admin: "/dashboard",
  packing: "/packing",
  delivery: "/delivery",
};

export default function LoginPage() {
  const router = useRouter();
  const { loginWithPassword, currentUser, liveMode, ready } = useAppContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentUser) router.replace(HOME[currentUser.role]);
  }, [currentUser, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await loginWithPassword(email, password);
      router.push(HOME[user.role]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">
        Loading console…
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_#cceedf,_#e8eef7_50%,_#f8fafc)] px-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
            National Traders
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Operations Console
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {liveMode
              ? "Sign in with your staff email and password."
              : "Supabase Auth is required for password login."}
          </p>
        </div>

        <SectionCard
          title="Staff login"
          description="Admin Anuj · Packing Somnath · Delivery Mayur"
        >
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
            {error ? (
              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}
            <Button type="submit" className="h-12 w-full text-base" disabled={submitting || !liveMode}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
