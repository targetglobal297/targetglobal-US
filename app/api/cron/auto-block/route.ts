// app/api/cron/auto-block/route.ts
// Vercel Cron Job — runs every hour
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

// ── Lazy Firebase Admin init (inside handler, not module level) ──
function getAdminDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeApp, getApps, cert } = require("firebase-admin/app");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getFirestore, Timestamp }       = require("firebase-admin/firestore");

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), Timestamp };
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://merchant-targetglobal.vercel.app";

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

async function sendBlockEmail(payload: {
  to: string; name: string; storeName: string;
  reason: string; overdueCount: number;
}) {
  try {
    await fetch(`${APP_URL}/api/send-email`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "store_blocked", ...payload }),
    });
  } catch (e) {
    console.warn("[auto-block] email failed for", payload.to, e);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check env vars before attempting anything
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return NextResponse.json({ error: "Firebase Admin env vars not configured." }, { status: 503 });
  }

  try {
    // Init inside handler — safe from build-time execution
    const { db, Timestamp } = getAdminDb();
    const cutoffTs = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Find pending orders older than 24hrs
    const pendingSnap = await db.collection("orders")
      .where("status", "==", "pending")
      .where("placedAt", "<", cutoffTs)
      .get();

    if (pendingSnap.empty) {
      return NextResponse.json({ ok: true, blocked: 0, message: "No overdue orders." });
    }

    // 2. Group by storeId
    const storeMap = new Map<string, {
      storeId: string; merchantId: string;
      storeName: string; overdueCount: number;
    }>();

    for (const snap of pendingSnap.docs) {
      const o = snap.data();
      if (!o.storeId) continue;
      if (!storeMap.has(o.storeId)) {
        storeMap.set(o.storeId, {
          storeId:      o.storeId,
          merchantId:   o.merchantId,
          storeName:    o.storeName ?? "Unknown Store",
          overdueCount: 0,
        });
      }
      storeMap.get(o.storeId)!.overdueCount++;
    }

    // 3. Block each store
    const batch         = db.batch();
    const blocked:      string[]       = [];
    const emailPromises: Promise<any>[] = [];

    for (const entry of storeMap.values()) {
      const storeDoc = await db.collection("stores").doc(entry.storeId).get();
      if (!storeDoc.exists || storeDoc.data()?.status === "blocked") continue;

      const reason = `${entry.overdueCount} order${entry.overdueCount > 1 ? "s" : ""} left unsubmitted for over 24 hours.`;

      batch.update(db.collection("stores").doc(entry.storeId), {
        status: "blocked", blockedAt: Timestamp.now(),
        blockedReason: reason, autoBlocked: true,
      });

      batch.set(db.collection("notifications").doc(), {
        userId: entry.merchantId, type: "block",
        title: "Store auto-blocked",
        body:  `Your store was temporarily blocked: ${reason} Contact support to resolve.`,
        read: false, createdAt: Timestamp.now(),
      });

      blocked.push(entry.storeName);

      const userSnap = await db.collection("users").doc(entry.merchantId).get();
      const email    = userSnap.data()?.email;
      const name     = userSnap.data()?.displayName ?? entry.storeName;

      if (email) {
        emailPromises.push(sendBlockEmail({
          to: email, name, storeName: entry.storeName,
          reason, overdueCount: entry.overdueCount,
        }));
      }
    }

    await batch.commit();
    await Promise.allSettled(emailPromises);

    console.log(`[auto-block] Blocked ${blocked.length} store(s):`, blocked);

    return NextResponse.json({
      ok: true, blocked: blocked.length,
      stores: blocked, checked: pendingSnap.size,
    });

  } catch (err: any) {
    console.error("[auto-block] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
