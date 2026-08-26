import Link from "next/link";
import { notFound } from "next/navigation";
import { Investigation } from "@/components/command-room/investigation";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, getIncident, type IncidentDetail } from "@/lib/api";

export const dynamic = "force-dynamic";

function Sparkline({ points }: { points: IncidentDetail["metrics"] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.latency_p95_ms);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((p.latency_p95_ms - min) / span) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
        <span>P95 LATENCY · LAST 90 MIN</span>
        <span className="text-foreground">{values.at(-1)} ms</span>
      </figcaption>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-3 h-24 w-full"
        role="img"
        aria-label={`Latency from ${values[0]} to ${values.at(-1)} milliseconds over the last 90 minutes`}
      >
        <path d={path} fill="none" stroke="var(--amber)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{points[0].at}</span>
        <span>{points.at(-1)?.at}</span>
      </div>
    </figure>
  );
}

export default async function IncidentPage({
  params,
  searchParams,
}: PageProps<"/incidents/[id]">) {
  const { id } = await params;
  const { session } = await searchParams;

  let data: IncidentDetail;
  try {
    data = await getIncident(id);
  } catch {
    notFound();
  }

  const { incident, metrics, logs, deployments, actions } = data;
  const latest = metrics.at(-1);

  return (
    <main className="flex flex-1 flex-col px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-xs tracking-[0.3em] text-amber">
          {incident.id} · {incident.service_id} · {incident.severity}
        </p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/#command-room" />}
        >
          Back to Command Room
        </Button>
      </div>

      <h1 className="mt-4 max-w-3xl font-heading text-4xl sm:text-5xl">
        {incident.title}
      </h1>
      <p className="mt-3 font-mono text-sm text-muted-foreground">
        {incident.impact} · {STATUS_LABEL[incident.status]}
      </p>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-panel/95 p-5 lg:col-span-2">
          <Sparkline points={metrics} />
          {latest && (
            <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 font-mono text-xs">
              <div>
                <dt className="text-muted-foreground">ERROR RATE</dt>
                <dd className="mt-1 text-lg text-signal">{latest.error_rate}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">P95</dt>
                <dd className="mt-1 text-lg text-foreground">
                  {latest.latency_p95_ms} ms
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-md border border-border bg-panel/95 p-5">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            RECENT DEPLOYS
          </p>
          <ul className="mt-3 space-y-3">
            {deployments.slice(0, 3).map((deploy) => (
              <li key={`${deploy.version}-${deploy.deployed_at}`}>
                <p className="font-mono text-sm">
                  {deploy.version}{" "}
                  <span
                    className={
                      deploy.status === "active" ? "text-phosphor" : "text-muted-foreground"
                    }
                  >
                    · {deploy.status}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {deploy.changelog}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {logs.length > 0 && (
        <section className="mt-4 rounded-md border border-border bg-panel/95 p-5">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            TOP ERRORS
          </p>
          <ul className="mt-3 space-y-2 font-mono text-xs">
            {logs.map((log) => (
              <li key={log.message} className="flex flex-wrap gap-x-4">
                <span className="text-signal">{log.occurrences}×</span>
                <span className="text-muted-foreground">{log.endpoint}</span>
                <span className="text-foreground/85">{log.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {actions.length > 0 && (
        <section className="mt-4 rounded-md border border-border bg-panel/95 p-5">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            ACTIONS TAKEN · EACH ONE APPROVED BY A HUMAN
          </p>
          <ul className="mt-3 space-y-2 font-mono text-xs">
            {actions.map((action, i) => (
              <li key={`${action.type}-${i}`} className="flex flex-wrap gap-x-4">
                <span className="text-primary">{action.type}</span>
                <span className="text-phosphor">{action.result}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Investigation
        incidentId={incident.id}
        incidentStatus={incident.status}
        initialSessionId={typeof session === "string" ? session : undefined}
      />
    </main>
  );
}
