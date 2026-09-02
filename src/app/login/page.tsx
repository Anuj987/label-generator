"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppContext } from "@/components/providers/app-provider";
import { Button, Input, SectionCard } from "@/components/ui";
import { ROLE_HOME } from "@/lib/access";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, currentUser } = useAppContext();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(() => {
    const reason = searchParams.get("error");
    if (reason === "authorization") {
      return "This account is not authorized for the Operations Console.";
    }
    if (reason === "configuration") return "Authentication is not configured.";
    return "";
  });

  useEffect(() => {
    if (currentUser) router.replace(ROLE_HOME[currentUser.role]);
  }, [currentUser, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const profile = await login(identifier, password);
      setPassword("");
      router.replace(ROLE_HOME[profile.role]);
    } catch (loginError) {
      setPassword("");
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
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
        </div>

        <SectionCard title="Login">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Email"
              name="identifier"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? (
              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Login"}
            </Button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
