import type { Metadata } from "next";
import "./globals.css";
import AdminRouteShell from "./components/admin-route-shell";

export const metadata: Metadata = {
  title: "Starlen",
  description: "Starlen private AI workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AdminRouteShell>{children}</AdminRouteShell></body>
    </html>
  );
}

