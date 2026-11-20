import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kalbu — Digital Diary & Emotional Safe Haven",
  description:
    "End-to-end encrypted journal with Russell's Circumplex AI emotion analysis, Feeling Twin cosine matching, and ISO-principle music therapy.",
  icons: {
    icon: "/kalbu-logo.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500/20 selection:text-indigo-300"
      >
        {children}
      </body>
    </html>
  );
}
