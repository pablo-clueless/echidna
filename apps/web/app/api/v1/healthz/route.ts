import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness check for the deployment: the app's own API, served by the same Next.js deployment as the studio. */
export const GET = () => {
  const timestamp = new Date().toISOString();

  try {
    return NextResponse.json(
      {
        message: "Service is healthy",
        status: "ok",
        timestamp,
        uptime: process.uptime(),
      },
      { headers: { "Cache-Control": "no-store" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message, status: "error", timestamp }, { status: 500 });
  }
};
