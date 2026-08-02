import { cn } from "@/lib/utils";

interface SignalFieldProps {
  className?: string;
  /** Prefix SVG paint ids so multiple instances on one page don't clash. */
  idPrefix?: string;
  /** Soften edge fades — useful when clipped into a side panel. */
  edgeFade?: boolean;
}

export function SignalField({ className, idPrefix = "signal", edgeFade = true }: SignalFieldProps) {
  const stroke = `${idPrefix}-stroke`;
  const orbit = `${idPrefix}-orbit`;

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="signal-grid absolute inset-0 opacity-80" />

      <div className="absolute left-1/2 top-[38%] h-[42vmin] w-[42vmin] -translate-x-1/2 -translate-y-1/2 animate-soft-pulse rounded-full bg-[radial-gradient(circle,hsl(168_84%_42%_/_0.28),transparent_68%)]" />
      <div className="absolute right-[8%] top-[18%] h-[28vmin] w-[28vmin] animate-soft-pulse rounded-full bg-[radial-gradient(circle,hsl(186_92%_44%_/_0.18),transparent_70%)] [animation-delay:1.2s]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-[min(72vh,720px)] w-[min(92vw,920px)]">
          <svg viewBox="0 0 920 720" className="h-full w-full" fill="none">
            <defs>
              <linearGradient id={stroke} x1="0" y1="0" x2="920" y2="0">
                <stop offset="0%" stopColor="hsl(168 84% 36%)" stopOpacity="0" />
                <stop offset="35%" stopColor="hsl(168 84% 36%)" stopOpacity="0.9" />
                <stop offset="70%" stopColor="hsl(186 92% 44%)" stopOpacity="1" />
                <stop offset="100%" stopColor="hsl(186 92% 44%)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={orbit} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(168 84% 36%)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="hsl(186 92% 44%)" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            <ellipse
              cx="460"
              cy="340"
              rx="280"
              ry="180"
              stroke={`url(#${orbit})`}
              strokeWidth="1"
              className="origin-center animate-orbit"
              style={{ transformOrigin: "460px 340px" }}
            />
            <ellipse
              cx="460"
              cy="340"
              rx="210"
              ry="130"
              stroke={`url(#${orbit})`}
              strokeWidth="1"
              className="origin-center animate-orbit [animation-direction:reverse] [animation-duration:20s]"
              style={{ transformOrigin: "460px 340px" }}
            />

            <path
              d="M40 360 C120 360 140 220 220 220 C300 220 300 500 380 500 C460 500 460 280 540 280 C620 280 640 440 720 440 C800 440 820 360 880 360"
              stroke={`url(#${stroke})`}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="240 80"
              className="animate-signal-draw"
            />
            <path
              d="M80 400 C160 400 180 300 260 300 C340 300 340 460 420 460 C500 460 520 320 600 320 C680 320 700 400 840 400"
              stroke="hsl(186 92% 44% / 0.35)"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeDasharray="180 100"
              className="animate-signal-draw [animation-delay:0.6s]"
            />

            {[
              [220, 220],
              [380, 500],
              [540, 280],
              [720, 440],
            ].map(([x, y], i) => (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill="hsl(168 84% 36%)"
                  className="animate-pulse-dot"
                  style={{ animationDelay: `${i * 0.35}s` }}
                />
                <circle cx={x} cy={y} r="12" stroke="hsl(168 84% 36% / 0.35)" strokeWidth="1" />
              </g>
            ))}
          </svg>

          <div className="absolute inset-x-[12%] top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-signal/20 to-transparent" />
        </div>
      </div>

      {edgeFade && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background/80 to-transparent" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background/80 to-transparent" />
        </>
      )}
    </div>
  );
}
