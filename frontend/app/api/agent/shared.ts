import { NextResponse } from "next/server";
import { BackendError } from "@/lib/backend";

/** Pass the backend's status and message through unchanged so the Command
 *  Room can tell a stale approval (409) from a backend that is down (503). */
export function errorResponse(err: unknown) {
  if (err instanceof BackendError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json({ error: "Unexpected error talking to the backend" }, { status: 500 });
}
