import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, getIncident } from "@/lib/incidents";

export default async function IncidentPage({
  params,
}: PageProps<"/incidents/[id]">) {
  const { id } = await params;
  const incident = getIncident(id);
  if (!incident) notFound();

  return (
    <main className="flex flex-1 flex-col px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-xs tracking-[0.3em] text-amber">
          {incident.id} · {incident.serviceId} · {incident.severity}
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
      <div className="mt-10 rounded-md border border-border bg-panel/70 p-8 text-muted-foreground">
        The investigation view comes online next: the agent&apos;s live
        timeline, evidence charts, and the clearance console.
      </div>
    </main>
  );
}
