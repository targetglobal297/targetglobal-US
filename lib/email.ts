// lib/email.ts — Shared email helper (merchant app + admin app)

export type EmailPayload =
  | { type:"welcome";             to:string; name:string; storeName:string; country:string; }
  | { type:"admin_new_merchant";  to:string; merchantEmail:string; name:string; storeName:string; country:string; idType?:string; }
  | { type:"kyc_approved";        to:string; name:string; storeName:string; }
  | { type:"kyc_rejected";        to:string; name:string; storeName:string; reason?:string; }
  | {
      type:"order_placed";
      to:string; merchantName:string; storeName:string;
      customerName:string; customerAddress?:string; orderId:string;
      items:{ productName:string; productImage?:string; size?:string; color?:string; quantity:number; unitPrice:number; }[];
      totalBaseCost:number; merchantProfit:number;
    }
  | {
      type:"order_status_update";
      to:string; merchantName:string; storeName:string; customerName:string;
      orderId:string; status:"submitted"|"processing"|"shipped"|"delivered"|"cancelled";
      trackingNumber?:string; merchantProfit?:number;
    }
  | { type:"store_blocked"; to:string; name:string; storeName:string; reason:string; overdueCount?:number; };

// ── Always use absolute URL ────────────────────────────────────
// This file is shared between the merchant app AND admin app.
// The admin app has no /api/send-email route, so a relative URL
// would 404. Always point to the merchant app using NEXT_PUBLIC_APP_URL.
function getEmailEndpoint(): string {
  // NEXT_PUBLIC_ vars are inlined at build time for both client and server
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/send-email`;
  }
  // Fallback: if running in browser we can use origin (only works in merchant app)
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/send-email`;
  }
  return "https://merchantsignup.vercel.app/api/send-email";
}

// ── Send ──────────────────────────────────────────────────────
export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(getEmailEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = `Email API error ${res.status}: ${JSON.stringify(err)}`;
      console.warn("[sendEmail] failed:", payload.type, msg);
      return { ok: false, error: msg };
    }

    return { ok: true };
  } catch (e: any) {
    // Never throw — email failure must never break the app flow
    console.warn("[sendEmail] network error:", payload.type, e?.message);
    return { ok: false, error: e?.message };
  }
}
