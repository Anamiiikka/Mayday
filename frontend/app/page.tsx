import Image from "next/image";
import Link from "next/link";
import { CommandRoomSection } from "@/components/command-room/section";
import { Button } from "@/components/ui/button";

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

        <div className="mt-auto px-6 pb-8 pt-20 sm:px-10 sm:pb-10">
          <h1 className="max-w-4xl font-heading text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">
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
            render={<a href="#command-room" />}
          >
            Open Command Room
          </Button>
        </div>
      </section>

      <CommandRoomSection />

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
        <div className="w-full px-6 py-20 sm:px-10">
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
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-6 sm:px-10">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-10 gap-y-4">
          <div className="flex items-center gap-3">
            <Image src="/mark.png" alt="Mayday" width={28} height={28} />
            <span className="text-sm text-muted-foreground">
              Answers the call. Asks before it acts.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[11px] tracking-widest text-muted-foreground">
            <a
              href="https://github.com/Anamiiikka/Mayday"
              className="transition-colors hover:text-amber"
            >
              VIEW SOURCE
            </a>
            <span>POWERED BY TRUEFORGE</span>
            <span>© 2026 MAYDAY</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
