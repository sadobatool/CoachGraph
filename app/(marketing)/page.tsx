import Link from "next/link";
import { ArrowUpRight, Activity, Binary, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignalField } from "@/components/brand/SignalField";

const SIGNALS = [
  {
    icon: Radar,
    title: "Conversational intake",
    description: "Goals, equipment, and injuries in plain chat — no intake forms.",
  },
  {
    icon: Binary,
    title: "Real math, not guesses",
    description: "TDEE and macros from Mifflin-St Jeor — computed every time.",
  },
  {
    icon: Activity,
    title: "Adapts to real signals",
    description: "Plateau and missed-session logic runs in code. The model only rewrites when a signal fires.",
  },
];

export default function Home() {
  return (
    <div className="relative">
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col justify-end overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pb-20">
        <SignalField />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8">
          <div className="max-w-2xl animate-fade-up">
            <p className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-7xl md:text-8xl">
              adapt<span className="text-primary">coach</span>
            </p>
            <h1 className="mt-5 max-w-xl font-display text-2xl font-medium leading-snug tracking-tight text-foreground/90 sm:text-3xl">
              Your plan, adapted by real progress.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              A coaching agent that listens for signals — then rewrites training and nutrition only when the data says it should.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="glow-ring h-12 px-7 text-base">
                <Link href="/chat">
                  Start coaching
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">LangGraph harness · deterministic signals</span>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-border/70 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-lg animate-fade-up [animation-delay:120ms]">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Built to respond, not guess.
            </h2>
            <p className="mt-3 text-muted-foreground">
              An orchestrator routes intake or check-in. Specialists handle nutrition and training — the LLM only moves when a signal proves it.
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
            {SIGNALS.map((item, index) => (
              <div
                key={item.title}
                className="animate-fade-up border-t border-primary/30 pt-6"
                style={{ animationDelay: `${180 + index * 90}ms` }}
              >
                <item.icon className="mb-4 h-5 w-5 text-primary" strokeWidth={1.75} />
                <h3 className="font-display text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
