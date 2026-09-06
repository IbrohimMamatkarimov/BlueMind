import { NextResponse } from "next/server";
// Compatibility response for older clients; no storage or AI calls.
export function GET() { return NextResponse.json({ error: "This feature has been removed." }, { status: 410 }); }
export const POST = GET;
export const DELETE = GET;
