import Link from "next/link";
import { Transcript } from "@/components/landing/transcript";
import { Button } from "@/components/ui/button";

const PILLARS = [
  {
    call: "RECEIVE",
    title: "Listens on your telemetry",
    body: "Pulls metrics, logs, and deploy history through MCP tools that are strictly read-only. Investigation can never change your systems.",
  },
  {
    call: "DIAGNOSE",
    title: "Runs the numbers in a sandbox",
    body: "Writes its own diagnostic scripts and executes them in an isolated sandbox — never on your machines, never with your credentials.",
  },
  {
    call: "REQUEST CLEARANCE",
    title: "Never acts alone",
    body: "Every restart, rollback, or scale-up pauses at an approval gate. Nothing irreversible happens until an operator clears it.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-10">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-xl font-bold tracking-[0.2em]">
            MAYDAY
          </span>
          <span className="hidden font-mono text-[11px] tracking-widest text-muted-foreground sm:inline">
            INCIDENT RESPONSE · HUMAN ON THE LOOP
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/command-room" />}
        >
          Open Command Room
        </Button>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-amber">
            DISTRESS CALL PROTOCOL FOR PRODUCTION
          </p>
          <h1
            className="mt-5 font-heading font-bold uppercase leading-[0.9] tracking-tight"
            aria-label="Mayday, mayday, mayday"
          >
            <span className="block text-6xl sm:text-7xl lg:text-8xl">Mayday</span>
            <span
              className="block text-6xl text-foreground/40 sm:text-7xl lg:text-8xl"
              aria-hidden
            >
              Mayday
            </span>
            <span
              className="block text-6xl text-foreground/15 sm:text-7xl lg:text-8xl"
              aria-hidden
            >
              Mayday
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            When production sends a distress call, Mayday answers: it
            investigates with read-only tools, diagnoses in an isolated
            sandbox, and fixes only with your approval.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Button
              size="lg"
              className="px-5 font-semibold"
              render={<Link href="/command-room" />}
            >
              Open Command Room
            </Button>
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
              RUNS ON TRUEFORGE · MCP · SANDBOX · APPROVALS
            </span>
          </div>
        </div>
        <Transcript />
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-px overflow-hidden px-6 py-14 sm:px-10 md:grid-cols-3 md:gap-10">
          {PILLARS.map((pillar) => (
            <div key={pillar.call} className="py-6 md:py-0">
              <p className="font-mono text-[11px] tracking-[0.3em] text-amber">
                {pillar.call}
              </p>
              <h2 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide">
                {pillar.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-5 sm:px-10">
        <p className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 font-mono text-[11px] tracking-widest text-muted-foreground">
          <span>MAYDAY — BUILT FOR THE AGENT HARNESS HACKATHON 2026</span>
          <span>SQUAWK 7700</span>
        </p>
      </footer>
    </main>
  );
}
