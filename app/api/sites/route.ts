import { NextResponse } from "next/server";

import { getSitesForClient } from "@/lib/notion-sync";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const offset = parsePositiveInt(searchParams.get("offset"), 0);
  const rawLimit = parsePositiveInt(searchParams.get("limit"), 0);
  const limit = rawLimit > 0 ? Math.min(rawLimit, 100) : 0;

  try {
    const result = await getSitesForClient();
    const total = result.sites.length;
    const slicedSites = limit > 0 ? result.sites.slice(offset, offset + limit) : result.sites;
    const hasMore = limit > 0 ? offset + slicedSites.length < total : false;
    const nextOffset = hasMore ? offset + slicedSites.length : null;

    return NextResponse.json(
      {
        ...result,
        sites: slicedSites,
        total,
        offset,
        limit,
        hasMore,
        nextOffset,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        sites: [],
        source: "unavailable" as const,
        syncedAt: null,
        total: 0,
        offset,
        limit,
        hasMore: false,
        nextOffset: null,
        error: "sites-unavailable",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
