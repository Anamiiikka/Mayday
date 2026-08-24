"use client";

import { useEffect, useRef, useState } from "react";

type Tone = "alert" | "agent" | "human" | "ok";

interface TranscriptLine {
  time: string;
  from: string;
  tone: Tone;
  text: string;
}

const LINES: TranscriptLine[] = [
  {
    time: "14:02:11",
    from: "MONITOR",
    tone: "alert",
    text: "MAYDAY MAYDAY MAYDAY — checkout-api p95 at 2,400 ms, error rate 8.1%.",
  },
  {
    time: "14:02:14",
    from: "MAYDAY",
    tone: "agent",
    text: "Copy. Investigating. Pulling metrics, logs, and deploy history — read-only.",
  },
  {
    time: "14:02:39",
    from: "MAYDAY",
    tone: "agent",
    text: "Diagnostics running in sandbox: grouping errors by endpoint, diffing against last deploy.",
  },
  {
    time: "14:03:02",
    from: "MAYDAY",
    tone: "agent",
    text: "Cause found: deploy v1.4.2 leaks DB connections. Requesting clearance to roll back to v1.4.1.",
  },
  {
    time: "14:03:40",
    from: "OPERATOR",
    tone: "human",
    text: "Clearance granted. Proceed.",
  },
  {
    time: "14:03:41",
    from: "MAYDAY",
    tone: "agent",
    text: "Rolling back… p95 recovering: 2,400 ms → 210 ms.",
  },
  {
    time: "14:04:12",
    from: "MAYDAY",
    tone: "ok",
    text: "Incident resolved. Standing by.",
  },
];

const CHAR_INTERVAL_MS = 18;
const LINE_PAUSE_MS = 420;

const FROM_COLOR: Record<Tone, string> = {
  alert: "text-signal",
  agent: "text-amber",
  human: "text-foreground",
  ok: "text-phosphor",
};

const TEXT_COLOR: Record<Tone, string> = {
  alert: "text-signal",
  agent: "text-foreground/90",
  human: "text-foreground/90",
  ok: "text-phosphor",
};

/**
 * Types the incident transcript out line by line like live radio traffic.
 * With prefers-reduced-motion, the full transcript renders immediately.
 */
export function Transcript() {
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [animate, setAnimate] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!query.matches);
  }, []);

  useEffect(() => {
    if (!animate || lineIndex >= LINES.length) return;
    const line = LINES[lineIndex];
    const timer = setTimeout(
      () => {
        if (charIndex < line.text.length) {
          setCharIndex(charIndex + 1);
        } else {
          setLineIndex(lineIndex + 1);
          setCharIndex(0);
        }
      },
      charIndex === 0 ? LINE_PAUSE_MS : CHAR_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [animate, lineIndex, charIndex]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lineIndex, charIndex]);

  if (animate === null) {
    return <TranscriptFrame lines={[]} done={false} onReplay={() => {}} />;
  }

  const done = !animate || lineIndex >= LINES.length;
  const visible = done
    ? LINES
    : [
        ...LINES.slice(0, lineIndex),
        { ...LINES[lineIndex], text: LINES[lineIndex].text.slice(0, charIndex) },
      ];

  return (
    <TranscriptFrame
      lines={visible}
      done={done}
      scrollRef={scrollRef}
      onReplay={() => {
        setLineIndex(0);
        setCharIndex(0);
        setAnimate(true);
      }}
    />
  );
}

function TranscriptFrame({
  lines,
  done,
  scrollRef,
  onReplay,
}: {
  lines: TranscriptLine[];
  done: boolean;
  scrollRef?: React.Ref<HTMLDivElement>;
  onReplay: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-md border border-border bg-panel/80 font-mono text-[13px] leading-relaxed shadow-[0_0_60px_-20px_rgba(255,178,36,0.15)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[11px] tracking-widest text-muted-foreground">
        <span>CH 121.5 · GUARD</span>
        <span className="flex items-center gap-2">
          <span
            className="size-1.5 rounded-full bg-amber motion-safe:animate-pulse"
            aria-hidden
          />
          LIVE TRANSCRIPT
        </span>
      </div>
      <div
        ref={scrollRef}
        className="min-h-[300px] flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:min-h-[340px]"
        aria-live="polite"
      >
        {lines.map((line, i) => (
          <p key={i} className="grid grid-cols-[auto_5.5rem_1fr] gap-x-3">
            <span className="text-muted-foreground/60">{line.time}</span>
            <span className={FROM_COLOR[line.tone]}>{line.from}</span>
            <span className={TEXT_COLOR[line.tone]}>
              {line.text}
              {!done && i === lines.length - 1 && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-amber motion-safe:animate-pulse" />
              )}
            </span>
          </p>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span>INC-0042 · checkout-api · SEV-1</span>
        {done && (
          <button
            type="button"
            onClick={onReplay}
            className="tracking-widest text-muted-foreground transition-colors hover:text-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            REPLAY
          </button>
        )}
      </div>
    </div>
  );
}
