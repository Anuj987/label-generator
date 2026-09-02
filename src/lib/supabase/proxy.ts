import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, roleCanAccessPath } from "@/lib/access";
import { supabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import type { Role } from "@/lib/types";

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "packing" || value === "delivery";
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

export async function updateSessionAndAuthorize(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  if (!supabaseConfigured) {
    return pathname === "/login"
      ? response
      : NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authUserId = claimsError ? null : claimsData?.claims?.sub;

  if (!authUserId) {
    return pathname === "/login"
      ? response
      : redirectWithCookies(new URL("/login", request.url), response);
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id,name,role,active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .maybeSingle();

  if (profileError || !profile || !isRole(profile.role)) {
    return pathname === "/login"
      ? response
      : redirectWithCookies(new URL("/login?error=authorization", request.url), response);
  }

  if (pathname === "/login" || pathname === "/") {
    return redirectWithCookies(new URL(ROLE_HOME[profile.role], request.url), response);
  }

  if (!roleCanAccessPath(profile.role, pathname)) {
    return redirectWithCookies(new URL(ROLE_HOME[profile.role], request.url), response);
  }

  return response;
}
