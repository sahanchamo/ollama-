import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ollama API Console",
  description: "Test console for the Ollama Gateway API",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

