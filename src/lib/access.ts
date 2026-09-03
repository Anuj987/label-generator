import type { Role } from "@/lib/types";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  packing: "/packing",
  delivery: "/delivery",
};

export function roleCanAccessPath(role: Role, pathname: string) {
  if (pathname === "/" || pathname === "/search") return true;
  if (pathname.startsWith("/orders/")) return true;
  if (pathname === "/payments") return role === "admin" || role === "delivery";
  if (pathname === "/expenses") return role === "admin" || role === "delivery";
  if (pathname === "/packing") return role === "packing";
  if (pathname === "/delivery") return role === "delivery";
  if (
    pathname === "/dashboard" ||
    pathname === "/customers" ||
    pathname === "/orders" ||
    pathname === "/export"
  ) {
    return role === "admin";
  }
  return false;
}
