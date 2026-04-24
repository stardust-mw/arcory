import { NextResponse } from "next/server";

import {
  confirmClassificationLockFromCache,
  getClassificationLockStatus,
  unlockClassificationLock,
} from "@/lib/notion-sync";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.NOTION_SYNC_SECRET;
  if (!secret) return true;

  const secretFromHeader = request.headers.get("x-sync-secret");
  if (secretFromHeader && secretFromHeader === secret) return true;

  const authorization = request.headers.get("authorization");
  if (!authorization) return false;

  const [type, token] = authorization.split(" ");
  if (type?.toLowerCase() !== "bearer") return false;
  return token === secret;
}

export async function GET() {
  try {
    const status = await getClassificationLockStatus();
    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read classification lock status",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const actionByQuery = url.searchParams.get("action");
    const body = (await request.json().catch(() => ({}))) as { action?: "lock" | "unlock" };
    const action = body.action ?? (actionByQuery === "unlock" ? "unlock" : "lock");

    if (action === "unlock") {
      const result = await unlockClassificationLock();
      return NextResponse.json(
        {
          action: "unlock",
          ...result,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const result = await confirmClassificationLockFromCache();
    return NextResponse.json(
      {
        action: "lock",
        ...result,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update classification lock",
      },
      { status: 500 },
    );
  }
}
