import Image from "next/image";
import Link from "next/link";
import { listIncidents } from "@/lib/backend";
import {
  STATUS_LABEL,
  type Incident,
  type IncidentStatus,
  type Service,
  type Severity,
} from "@/lib/types";

const SEVERITY_STYLE: Record<Severity, string> = {
  "SEV-1": "border-signal/40 bg-signal/10 text-signal",
  "SEV-2": "border-amber/40 bg-amber/10 text-amber",
  "SEV-3": "border-border bg-muted text-foreground/70",
};

const STATUS_STYLE: Record<IncidentStatus, string> = {
  open: "text-signal",
  investigating: "text-amber",
  awaiting_approval: "text-primary",
  resolved: "text-phosphor",
};

function HealthTiles({
  incidents,
  services,
}: {
  incidents: Incident[];
  services: Service[];
}) {
  const healthy = services.filter((s) => s.status === "healthy").length;
  const open = incidents.filter((i) => i.status !== "resolved").length;
  const awaiting = incidents.filter(
    (i) => i.status === "awaiting_approval",
  ).length;

  const tiles = [
    {
      label: "SERVICES HEALTHY",
      value: `${healthy}/${services.length}`,
      tone: healthy === services.length ? "text-phosphor" : "text-amber",
    },
    {
      label: "OPEN INCIDENTS",
      value: String(open),
      tone: open === 0 ? "text-phosphor" : "text-signal",
    },
    {
      label: "AWAITING YOUR CLEARANCE",
      value: String(awaiting),
      tone: awaiting === 0 ? "text-foreground/70" : "text-primary",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-md border border-border bg-panel/95 px-5 py-4"
        >
          <p className="font-mono text-[10px] tracking-[0.25em] text-foreground/75">
            {tile.label}
          </p>
          <p className={`mt-2 font-heading text-4xl ${tile.tone}`}>
            {tile.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="group flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-border bg-panel/95 px-5 py-4 transition-colors hover:border-amber/50"
    >
      <span
        className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] tracking-wider ${SEVERITY_STYLE[incident.severity]}`}
      >
        {incident.severity}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{incident.title}</span>
        <span className="mt-0.5 block font-mono text-[11px] tracking-wider text-foreground/70">
          {incident.id} · {incident.service_id} · {incident.impact}
        </span>
      </span>
      <span
        className={`font-mono text-[11px] tracking-wider ${STATUS_STYLE[incident.status]}`}
      >
        {incident.status === "investigating" && (
          <span
            className="mr-1.5 inline-block size-1.5 rounded-full bg-amber motion-safe:animate-pulse"
            aria-hidden
          />
        )}
        {STATUS_LABEL[incident.status].toUpperCase()}
      </span>
      <span className="font-mono text-[11px] tracking-wider text-foreground/80 transition-colors group-hover:text-amber">
        INVESTIGATE →
      </span>
    </Link>
  );
}

export async function CommandRoomSection() {
  let incidents: Incident[] = [];
  let services: Service[] = [];
  let offline = false;
  try {
    ({ incidents, services } = await listIncidents());
  } catch {
    // The landing page still has to render when the backend is not running.
    offline = true;
  }

  return (
    <section id="command-room" className="relative isolate border-y border-border">
      <Image
        src="/bg.png"
        alt=""
        fill
        sizes="100vw"
        className="-z-10 object-cover"
      />
      <div
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-background to-transparent"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-t from-background to-transparent"
        aria-hidden
      />
      <div className="px-6 py-16 sm:px-10">
        <p className="font-mono text-xs tracking-[0.3em] text-amber">
          COMMAND ROOM
        </p>
        <h2 className="mt-3 font-heading text-4xl sm:text-5xl">
          The floor is <em className="text-primary">live.</em>
        </h2>
        <p className="mt-3 max-w-md font-medium text-foreground [text-shadow:0_1px_10px_rgba(10,15,30,0.95)]">
          Every incident, what the agent is doing about it, and what is
          waiting on you.
        </p>
        {offline ? (
          <p className="mt-8 rounded-md border border-border bg-panel/95 px-5 py-4 font-mono text-sm text-muted-foreground">
            The incident feed is offline. Start the backend with{" "}
            <span className="text-foreground">npm run dev</span> in{" "}
            <span className="text-foreground">backend/</span> to bring it up.
          </p>
        ) : (
          <>
            <div className="mt-8">
              <HealthTiles incidents={incidents} services={services} />
            </div>
            <div className="mt-6 flex flex-col gap-3">
              {incidents.map((incident) => (
                <IncidentRow key={incident.id} incident={incident} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
