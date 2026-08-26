import { NextResponse } from "next/server";
import { BackendError, decideApproval } from "@/lib/backend";
import { errorResponse } from "../shared";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      threadId?: string;
      toolCallId?: string;
      decision?: "allow" | "deny";
    };
    const { sessionId, threadId, toolCallId, decision } = body;
    if (!sessionId || !threadId || !toolCallId || !decision) {
      return NextResponse.json(
        { error: "sessionId, threadId, toolCallId and decision are required" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await decideApproval({ sessionId, threadId, toolCallId, decision }),
    );
  } catch (err) {
    return errorResponse(err as BackendError);
  }
}
