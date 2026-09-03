import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are vendored rather than fetched from Google at build time, so the
// image builds (and rebuilds) on a home server with no outbound access, and
// nothing is requested from a third party at runtime. Each family is split
// into latin and latin-ext; the browser only pulls the ext file if a name on
// the page needs a glyph the latin subset does not carry.
const sans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});
const sansExt = localFont({
  src: "./fonts/geist-latin-ext.woff2",
  variable: "--font-geist-ext",
  weight: "100 900",
  display: "swap",
});
const display = localFont({
  src: "./fonts/cinzel-latin.woff2",
  variable: "--font-cinzel",
  weight: "400 700",
  display: "swap",
});
const displayExt = localFont({
  src: "./fonts/cinzel-latin-ext.woff2",
  variable: "--font-cinzel-ext",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Halls of the Champions",
  description: "An archive of every Path of Exile character you have ever played, league by league.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${sansExt.variable} ${display.variable} ${displayExt.variable} antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-line bg-abyss/85 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 py-3">
              <Link href="/" className="group flex items-baseline gap-3">
                <span className="display text-lg leading-none">Halls of the Champions</span>
                <span className="hidden text-[0.68rem] tracking-[0.24em] text-muted uppercase sm:inline">
                  Path of Exile archive
                </span>
              </Link>
              <nav className="flex items-center gap-5 text-sm">
                <Link href="/players" className="link-gold">
                  Players
                </Link>
                <Link href="/players/new" className="btn btn-gold px-3 py-1.5 text-xs">
                  Create profile
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-8">{children}</main>
          <footer className="border-t border-line px-5 py-6 text-center text-xs text-muted">
            Halls of the Champions — a fan-made archive. Not affiliated with Grinding Gear Games.
          </footer>
        </div>
      </body>
    </html>
  );
}
