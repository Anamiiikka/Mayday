import Image from "next/image";
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

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <Image src="/mark.png" alt="" width={36} height={36} priority />
      <span className="flex flex-col leading-none">
        <span className="font-sans text-lg font-semibold tracking-[0.3em]">
          MAYDAY
        </span>
        <span className="mt-1 font-mono text-[9px] tracking-[0.28em] text-muted-foreground">
          DETECT · INVESTIGATE · RESPOND
        </span>
      </span>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero — the agent's response journey is part of the key art itself. */}
      <section className="relative isolate flex min-h-[92svh] flex-col">
        <Image
          src="/landing.png"
          alt="Night-time industrial plant with Mayday's response steps — incident detected, investigate, diagnose, propose, approval required — overlaid in the sky"
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-[72%_center]"
        />
        <div
          className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/70 to-transparent"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-b from-transparent to-background"
          aria-hidden
        />

        <div className="absolute left-6 top-6 sm:left-10">
          <Wordmark />
        </div>

        <div className="mt-auto px-6 pb-14 pt-40 sm:px-10 sm:pb-16">
          <h1 className="max-w-4xl font-heading text-5xl leading-[1.06] sm:text-6xl lg:text-7xl">
            Production went down.
            <span className="block italic text-primary">Mayday picked up.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-foreground/85">
            Mayday answers the call — it investigates with read-only tools,
            diagnoses in a sandbox, and fixes only with your approval.
          </p>
          <Button
            size="lg"
            className="mt-7 bg-flare px-5 font-semibold text-white hover:opacity-90"
            nativeButton={false}
            render={<Link href="/command-room" />}
          >
            Open Command Room
          </Button>
        </div>
      </section>

      <section id="how" className="border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:px-10 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.call}>
              <p className="font-mono text-[11px] tracking-[0.3em] text-amber">
                {pillar.call}
              </p>
              <h2 className="mt-3 font-heading text-2xl">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="radio" className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:px-10">
          <p className="text-center font-mono text-xs tracking-[0.3em] text-amber">
            RADIO TRAFFIC
          </p>
          <h2 className="mt-3 text-center font-heading text-4xl sm:text-5xl">
            Four minutes from alert to{" "}
            <em className="text-primary">all-clear</em>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
            One response, end to end. The clearance request is the moment a
            human decides — everything before it is read-only.
          </p>
          <div className="mt-10">
            <Transcript />
          </div>
        </div>
      </section>

      {/* Closing band — the operator Mayday reports to. */}
      <section id="watch" className="relative isolate flex min-h-[64svh] items-center">
        <Image
          src="/footer.png"
          alt="An engineer in a hard hat watching over an industrial plant at dawn"
          fill
          sizes="100vw"
          className="-z-10 object-cover object-[80%_center]"
        />
        <div
          className="absolute inset-0 -z-10 bg-linear-to-b from-background via-background/40 to-background/80"
          aria-hidden
        />
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-10">
          <p className="font-mono text-xs tracking-[0.3em] text-amber">
            ALWAYS ON WATCH
          </p>
          <h2 className="mt-4 max-w-2xl font-heading text-5xl leading-[1.08] sm:text-6xl">
            The night shift
            <span className="block italic text-primary">
              you never have to wake.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-lg text-foreground/80">
            Mayday keeps watch, does the legwork, and calls you only when a
            decision is yours to make.
          </p>
          <Button
            size="lg"
            className="mt-8 bg-flare px-5 font-semibold text-white hover:opacity-90"
            nativeButton={false}
                render={<Link href="/command-room" />}
          >
            Open Command Room
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-6 sm:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
          <Wordmark />
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
            BUILT FOR THE AGENT HARNESS HACKATHON 2026 · SQUAWK 7700
          </p>
        </div>
      </footer>
    </main>
  );
}
