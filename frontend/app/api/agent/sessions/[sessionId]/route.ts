import { NextResponse } from "next/server";
import { BackendError, getAgentState } from "@/lib/backend";
import { errorResponse } from "../../shared";

export async function GET(_req: Request, ctx: RouteContext<"/api/agent/sessions/[sessionId]">) {
  try {
    const { sessionId } = await ctx.params;
    return NextResponse.json(await getAgentState(sessionId));
  } catch (err) {
    return errorResponse(err as BackendError);
  }
}
