import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json(
        {
            message: "Service is healthy",
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
