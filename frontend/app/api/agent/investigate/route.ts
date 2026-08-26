import { NextResponse } from "next/server";
import { BackendError, startInvestigation } from "@/lib/backend";
import { errorResponse } from "../shared";

export async function POST(req: Request) {
  try {
    const { incidentId } = (await req.json()) as { incidentId?: string };
    if (!incidentId) {
      return NextResponse.json({ error: "incidentId is required" }, { status: 400 });
    }
    return NextResponse.json(await startInvestigation(incidentId));
  } catch (err) {
    return errorResponse(err as BackendError);
  }
}
