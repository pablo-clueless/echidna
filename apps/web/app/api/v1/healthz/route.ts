import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = () => {
  const timestamp = new Date().toISOString();

  try {
    NextResponse.json(
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
