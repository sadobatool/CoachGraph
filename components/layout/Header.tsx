import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center">
            <span className="absolute inset-0 rounded-lg bg-primary/15 transition group-hover:bg-primary/25" />
            <span className="absolute inset-[3px] rounded-md border border-primary/30" />
            <span className="relative h-2 w-2 rounded-[2px] bg-primary shadow-[0_0_12px_hsl(var(--glow)/0.8)]" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Coach<span className="text-primary">Graph</span>
          </span>
        </Link>

        <Link
          href="/chat"
          className="group text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open chat
          <span className="ml-1.5 inline-block text-primary transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>
    </header>
  );
}
