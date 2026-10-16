import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadFeed } from "@/lib/notifications";

/**
 * The signed-in account's notifications, polled by the dashboards so a new payment reminder
 * (or a read receipt) pops up without a page reload. Never cached: it differs per account and per second.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json(await loadFeed(session), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
