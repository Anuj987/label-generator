"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/providers/app-provider";
import { Button, SectionCard } from "@/components/ui";
import { DEMO_USERS, ROLE_LABELS } from "@/lib/demo-data";
import type { Role } from "@/lib/types";

const HOME: Record<Role, string> = {
  admin: "/dashboard",
  packing: "/packing",
  delivery: "/delivery",
};

export default function LoginPage() {
  const router = useRouter();
  const { login, currentUser } = useAppContext();

  useEffect(() => {
    if (currentUser) router.replace(HOME[currentUser.role]);
  }, [currentUser, router]);

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
            Demo login by role. Swap to Supabase Auth when credentials are ready.
          </p>
        </div>

        <SectionCard title="Choose role" description="Admin Anuj · Packing Somnath · Delivery Mayur">
          <div className="grid gap-3">
            {DEMO_USERS.map((user) => (
              <Button
                key={user.id}
                className="justify-between"
                onClick={() => {
                  login(user.role);
                  router.push(HOME[user.role]);
                }}
              >
                <span>{user.name}</span>
                <span className="text-teal-100">{ROLE_LABELS[user.role]}</span>
              </Button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
