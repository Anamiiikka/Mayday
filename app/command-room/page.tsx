import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CommandRoomPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-xs tracking-[0.3em] text-amber">
        COMMAND ROOM
      </p>
      <h1 className="font-heading text-4xl font-bold uppercase tracking-wide">
        Standing by
      </h1>
      <p className="max-w-md text-muted-foreground">
        The incident feed comes online next: live incidents, the agent&apos;s
        investigation timeline, and the approval console.
      </p>
      <Button variant="outline" render={<Link href="/" />}>
        Back to overview
      </Button>
    </main>
  );
}
