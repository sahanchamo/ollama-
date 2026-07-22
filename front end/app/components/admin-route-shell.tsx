"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminShell from "./admin-shell";

const ADMIN_ROUTES = ["/api-keys", "/analytics", "/admin/settings", "/admin/reset-password"];

export default function AdminRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return ADMIN_ROUTES.some((route) => pathname.startsWith(route)) ? <AdminShell>{children}</AdminShell> : children;
}
