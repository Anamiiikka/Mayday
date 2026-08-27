"use client";

import { Fragment, useState, type ReactNode } from "react";

/**
 * The agent writes its findings in Markdown. Rendering that verbatim leaves
 * hashes and asterisks on screen mid-incident, so this lays it out instead —
 * deliberately narrow in scope, covering only what the SOP actually produces:
 * headings, bullets, emphasis, inline code and rules.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

function inline(text: string): ReactNode {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-sm border border-border bg-panel/95 px-1 py-px font-mono text-[0.85em] text-amber"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "rule" }
  | { kind: "list"; items: { depth: number; text: string; ordinal?: string }[] }
  | { kind: "para"; text: string };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
// Em dashes survive round trips through the model, so treat them as rules too.
const RULE = /^\s*(-{3,}|—+-*|\*{3,})\s*$/;

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "para", text: paragraph.join(" ") });
    paragraph.length = 0;
  };

  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        text: heading[2]!,
      });
      continue;
    }

    const ordered = ORDERED.exec(line);
    const bullet = ordered ? null : BULLET.exec(line);
    if (ordered || bullet) {
      flush();
      const indent = (ordered ? ordered[1]! : bullet![1]!).length;
      const item = {
        depth: Math.min(1, Math.floor(indent / 2)),
        text: ordered ? ordered[3]! : bullet![2]!,
        ordinal: ordered ? ordered[2]! : undefined,
      };
      const last = blocks.at(-1);
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
      continue;
    }

    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

function Heading({ level, text }: { level: number; text: string }) {
  // The report's own title sits above a rule; its numbered sections read as
  // labels, which keeps the whole thing scannable during an incident.
  if (level <= 3) {
    return (
      <h4 className="mt-6 border-b border-border pb-2 font-heading text-lg first:mt-0">
        {inline(text)}
      </h4>
    );
  }
  return (
    <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-amber first:mt-0">
      {inline(text)}
    </p>
  );
}

function List({ items }: { items: { depth: number; text: string; ordinal?: string }[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={`flex gap-2.5 text-sm leading-relaxed text-foreground/85 ${
            item.depth > 0 ? "ml-5 border-l border-border pl-3" : ""
          }`}
        >
          <span
            className="mt-[0.45rem] shrink-0 font-mono text-[10px] text-muted-foreground"
            aria-hidden
          >
            {item.ordinal ? `${item.ordinal}.` : "—"}
          </span>
          <span className="min-w-0">{inline(item.text)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="max-w-3xl">
      {parse(source).map((block, i) => {
        switch (block.kind) {
          case "heading":
            return <Heading key={i} level={block.level} text={block.text} />;
          case "rule":
            return <hr key={i} className="my-5 border-border" />;
          case "list":
            return <List key={i} items={block.items} />;
          case "para":
            return (
              <p
                key={i}
                className="mt-2.5 text-sm leading-relaxed text-foreground/85 first:mt-0"
              >
                {inline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

/** Anything longer than a couple of sentences is a report, not an aside. */
const REPORT_CHARS = 320;

export function AgentNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.length <= REPORT_CHARS) {
    return (
      <div className="mt-2">
        <Markdown source={text} />
      </div>
    );
  }

  // The first line of the report is its title; the first sentence of prose is
  // the headline finding. Either one tells an operator whether to read on.
  const lead =
    text
      .split("\n")
      .map((line) => line.replace(HEADING, "$2").trim())
      .find((line) => line.length > 0) ?? "Incident report";

  return (
    <div className="mt-3 max-w-3xl overflow-hidden rounded-md border border-phosphor/30 bg-panel/95">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.22em] text-phosphor">
            INCIDENT REPORT
          </p>
          <p className="mt-1 truncate text-sm font-medium">{lead}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-widest text-foreground/80 transition-colors hover:border-amber/50 hover:text-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {open ? "HIDE FINDINGS" : "READ FINDINGS"}
        </button>
      </div>
      {open && (
        <div className="px-4 py-4">
          <Markdown source={text} />
        </div>
      )}
    </div>
  );
}
