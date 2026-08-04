// app/api/send-email/route.ts
import { NextRequest, NextResponse } from "next/server";

// ── Config ────────────────────────────────────────────────────
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL ?? "admin@targetglobal.org";
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL   ?? "https://merchant-targetglobal.vercel.app";
const ADMIN_URL     = process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://admin-targetglobal.vercel.app";

const FROM_SUPPORT = { email:"support@targetglobal.org", name:"TargetGlobal" };
const FROM_ALERTS  = { email:"alerts@targetglobal.org",  name:"TargetGlobal" };

const year = new Date().getFullYear();

// ── Financial helper ──────────────────────────────────────────
// Financial model:
// retail       = what merchant paid from wallet
// customerPays = retail * 1.20 (customer pays retail + 20% on delivery)
// platformFee  = 3% of customerPays
// profit       = customerPays - platformFee - retail (merchant net earnings)
function calcF(retail: number, storedProfit?: number) {
  const customerPays = +(retail * 1.20).toFixed(2);
  const fee          = +(customerPays * 0.03).toFixed(2);
  const merchantBack = +(customerPays - fee).toFixed(2);
  const profit       = storedProfit && storedProfit > 0
    ? storedProfit
    : +(merchantBack - retail).toFixed(2);
  const margin = customerPays > 0 ? Math.round((profit / customerPays) * 100) : 0;
  return { customerPays, fee, merchantBack, profit, margin };
}

// ── Shared layout primitives ──────────────────────────────────
const wrap = (inner: string, width = 600) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TargetGlobal</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="${width}" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.1);">
${inner}
<tr><td style="background:#0f172a;padding:20px 40px;text-align:center;">
  <p style="margin:0;font-size:11px;color:rgba(255,255,255,.3);line-height:1.8;">
    © ${year} TargetGlobal · <a href="mailto:support@targetglobal.org" style="color:rgba(255,255,255,.4);text-decoration:none;">support@targetglobal.org</a><br>
    TargetGlobal Merchant Platform · targetglobal.org
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

const header = (title: string, subtitle: string, accent = "#0f172a") => `
<tr><td style="background:${accent};padding:36px 40px 32px;text-align:center;">
  <div style="display:inline-block;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.3);border-radius:99px;padding:6px 16px;margin-bottom:16px;">
    <span style="font-size:11px;font-weight:700;color:#c9a84c;letter-spacing:2px;">TARGETGLOBAL</span>
  </div>
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#fff;letter-spacing:-.5px;">${title}</h1>
  <p style="margin:0;font-size:13px;color:rgba(255,255,255,.5);">${subtitle}</p>
</td></tr>`;

const section = (content: string) => `
<tr><td style="padding:36px 40px;">${content}</td></tr>`;

const cta = (label: string, url: string) => `
<div style="text-align:center;margin-top:28px;">
  <a href="${url}" style="display:inline-block;background:#0f172a;color:#c9a84c;padding:14px 32px;border-radius:99px;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:.3px;">
    ${label}
  </a>
</div>`;

const divider = `<div style="border-top:1px solid #f1f5f9;margin:24px 0;"></div>`;

const label = (text: string) =>
  `<div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">${text}</div>`;

// Status step bar for email (5 steps as table cells)
function statusBar(current: string) {
  const steps = ["pending","submitted","processing","shipped","delivered"];
  const labels = ["Pending","Submitted","Processing","Shipped","Delivered"];
  const idx = steps.indexOf(current);
  if (idx < 0) return "";
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
<tr>
${steps.map((s,i)=>{
  const done   = i < idx;
  const active = i === idx;
  const dotBg  = done?"#16a34a":active?"#2563eb":"#e2e8f0";
  const lineBg = done?"#16a34a":"#e2e8f0";
  return `
  <td style="text-align:center;vertical-align:top;padding:0 2px;">
    <div style="width:28px;height:28px;border-radius:50%;background:${dotBg};margin:0 auto 6px;display:flex;align-items:center;justify-content:center;line-height:28px;font-size:${done?11:10}px;color:#fff;font-weight:700;">
      ${done?"✓":i+1}
    </div>
    <div style="font-size:9px;font-weight:${active?700:500};color:${active?"#2563eb":done?"#16a34a":"#94a3b8"};line-height:1.3;">
      ${labels[i]}
    </div>
    ${i<4?`<div style="height:2px;background:${lineBg};margin:0 -4px;position:relative;top:-18px;z-index:0;"></div>`:""}
  </td>`;
}).join("")}
</tr>
</table>`;
}

// ── Brevo sender ──────────────────────────────────────────────
async function send({ from, to, subject, html }: {
  from:{ email:string; name:string }; to:string; subject:string; html:string;
}) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"application/json",
      "api-key":BREVO_API_KEY!,
    },
    body:JSON.stringify({ sender:from, to:[{email:to}], subject, htmlContent:html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(`Brevo error: ${res.status} ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ── Route ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!BREVO_API_KEY) {
    return NextResponse.json({ error:"Email service not configured." }, { status:503 });
  }
  try {
    const body    = await req.json();
    const { type } = body;

    // ────────────────────────────────────────────────────────────
    // 1. WELCOME
    // ────────────────────────────────────────────────────────────
    if (type === "welcome") {
      const { to, name, storeName, country } = body;
      await send({
        from:FROM_SUPPORT, to,
        subject:`Welcome to TargetGlobal, ${name}! Your store is under review`,
        html: wrap(`
${header("Welcome to TargetGlobal 🎉","Your dropshipping journey starts here")}
${section(`
<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 24px;">
  Hi <strong style="color:#0f172a;">${name}</strong>, great to have you on board.
  Your store <strong style="color:#0f172a;">"${storeName}"</strong> has been submitted for KYC review.
  We typically verify within <strong>24 hours</strong>.
</p>

${label("Your store details")}
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:28px;">
${[["Store name",storeName],["Country",country||"—"],["Status","Pending KYC Review"],["Plan","Starter — Free"]].map(([k,v],i)=>`
<tr style="background:${i%2?"#f9fafb":"#fff"}">
  <td style="padding:11px 16px;font-size:12px;color:#64748b;width:140px;">${k}</td>
  <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#0f172a;">${v}</td>
</tr>`).join("")}
</table>

${label("What happens next")}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
${[
  ["1","KYC Review","Our team checks your identity documents — usually under 24 hours."],
  ["2","Store Goes Live","Once approved, your store is activated and visible to customers."],
  ["3","Add Products","Browse 10,000+ products and add them to your store."],
  ["4","Start Earning","Earn profit on every delivered order, credited to your wallet."],
].map(([num,title,desc])=>`
<tr>
  <td style="padding:10px 0;vertical-align:top;width:36px;">
    <div style="width:28px;height:28px;border-radius:8px;background:#0f172a;color:#c9a84c;font-size:12px;font-weight:800;text-align:center;line-height:28px;">${num}</div>
  </td>
  <td style="padding:10px 0 10px 12px;vertical-align:top;">
    <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">${title}</div>
    <div style="font-size:12px;color:#64748b;line-height:1.6;">${desc}</div>
  </td>
</tr>`).join("")}
</table>

${cta("Go to Dashboard →", `${APP_URL}/merchant/dashboard`)}
`)}
`),
      });
      return NextResponse.json({ ok:true });
    }

    // ────────────────────────────────────────────────────────────
    // 2. ADMIN NEW MERCHANT ALERT
    // ────────────────────────────────────────────────────────────
    if (type === "admin_new_merchant") {
      const { merchantEmail, name, storeName, country, idType } = body;
      await send({
        from:FROM_ALERTS, to:ADMIN_EMAIL,
        subject:`New merchant: ${storeName} — KYC review needed`,
        html: wrap(`
<tr><td style="background:#0f172a;padding:28px 40px;">
  <div style="font-size:11px;font-weight:700;color:#c9a84c;letter-spacing:2px;margin-bottom:6px;">TARGETGLOBAL ADMIN</div>
  <div style="font-size:22px;font-weight:900;color:#fff;">New Merchant Registration</div>
</td></tr>
${section(`
<div style="background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.2);border-radius:10px;padding:14px 18px;margin-bottom:24px;">
  <span style="font-size:13px;font-weight:700;color:#2563eb;">⚡ Action required: Review KYC for ${name}</span>
</div>

${label("Merchant details")}
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:28px;">
${[
  ["Full Name",name],
  ["Email",merchantEmail],
  ["Store Name",storeName],
  ["Country",country||"—"],
  ["ID Type",idType||"—"],
  ["Registered",new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})],
].map(([k,v],i)=>`
<tr style="background:${i%2?"#f9fafb":"#fff"}">
  <td style="padding:11px 16px;font-size:12px;color:#64748b;font-weight:600;width:140px;">${k}</td>
  <td style="padding:11px 16px;font-size:13px;color:#0f172a;">${v}</td>
</tr>`).join("")}
</table>

<div style="display:flex;gap:12px;text-align:center;">
  <a href="${ADMIN_URL}/kyc" style="flex:1;display:inline-block;background:#0f172a;color:#c9a84c;padding:13px 20px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;">Review KYC →</a>
  <a href="${ADMIN_URL}/stores" style="flex:1;display:inline-block;background:#f8fafc;color:#374151;padding:13px 20px;border-radius:10px;font-weight:600;font-size:13px;text-decoration:none;border:1px solid #e5e7eb;">View Stores</a>
</div>
`)}
`, 520),
      });
      return NextResponse.json({ ok:true });
    }

    // ────────────────────────────────────────────────────────────
    // 3. KYC APPROVED
    // ────────────────────────────────────────────────────────────
    if (type === "kyc_approved") {
      const { to, name, storeName } = body;
      await send({
        from:FROM_SUPPORT, to,
        subject:`Your store "${storeName}" is now LIVE!`,
        html: wrap(`
<tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:52px 40px;text-align:center;">
  <div style="width:72px;height:72px;border-radius:20px;background:rgba(22,163,74,.2);border:2px solid rgba(22,163,74,.4);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;line-height:72px;font-size:36px;">✅</div>
  <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#fff;">You're live!</h1>
  <p style="margin:0;font-size:14px;color:rgba(255,255,255,.5);">"${storeName}" has been approved</p>
</td></tr>
${section(`
<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 28px;text-align:center;">
  Hi <strong>${name}</strong>, your identity has been verified and your store is now active.
  Start adding products and earn profit on every sale.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
${[
  ["Browse Catalog","10,000+ verified products ready to add to your store.","#f0fdf4","#16a34a"],
  ["Submit Orders","Once a customer orders, submit within 48hrs to process.","#eff6ff","#2563eb"],
  ["Earn Profit","Your profit is credited to your wallet after delivery.","#fefce8","#ca8a04"],
].map(([title,desc,bg,color])=>`
<tr><td style="padding:0 0 10px;">
  <div style="background:${bg};border-radius:12px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:4px;">${title}</div>
    <div style="font-size:12px;color:#64748b;line-height:1.6;">${desc}</div>
  </div>
</td></tr>`).join("")}
</table>

${cta("Browse Products & Start Selling →", `${APP_URL}/merchant/products?tab=catalog`)}
`)}
`),
      });
      return NextResponse.json({ ok:true });
    }

    // ────────────────────────────────────────────────────────────
    // 4. KYC REJECTED
    // ────────────────────────────────────────────────────────────
    if (type === "kyc_rejected") {
      const { to, name, storeName, reason } = body;
      await send({
        from:FROM_SUPPORT, to,
        subject:`Action needed — Verification issue with "${storeName}"`,
        html: wrap(`
<tr><td style="background:#0f172a;padding:36px 40px;text-align:center;">
  <div style="font-size:48px;margin-bottom:14px;">⚠️</div>
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#fff;">Verification Needed</h1>
  <p style="margin:0;font-size:13px;color:rgba(255,255,255,.4);">Additional information required for "${storeName}"</p>
</td></tr>
${section(`
<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 24px;">
  Hi <strong>${name}</strong>, we reviewed your application for
  <strong>"${storeName}"</strong> but couldn't verify your identity with the documents provided.
  This is a quick fix — please re-upload clear photos of your documents.
</p>

${reason ? `
${label("Reason for rejection")}
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
  <div style="font-size:13px;color:#dc2626;font-weight:600;line-height:1.7;">${reason}</div>
</div>` : ""}

${label("What to do")}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
${[
  ["Re-upload your ID","Ensure photos are clear, in focus and all corners visible."],
  ["Check expiry date","Make sure your document is not expired."],
  ["Match your name","The name on your ID must match what you registered with."],
].map(([title,desc],i)=>`
<tr><td style="padding:6px 0;vertical-align:top;">
  <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 16px;background:${i%2?"#f9fafb":"#fff"};border:1px solid #e5e7eb;border-radius:10px;margin-bottom:6px;">
    <div style="width:24px;height:24px;border-radius:6px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:800;text-align:center;line-height:24px;flex-shrink:0;">${i+1}</div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">${title}</div>
      <div style="font-size:12px;color:#64748b;">${desc}</div>
    </div>
  </div>
</td></tr>`).join("")}
</table>

${cta("Update My Documents →", `${APP_URL}/merchant/settings`)}
<p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:16px;">
  Need help? Use the live chat inside your dashboard — we respond within minutes.
</p>
`)}
`),
      });
      return NextResponse.json({ ok:true });
    }

    // ────────────────────────────────────────────────────────────
    // 5. ORDER PLACED
    // ────────────────────────────────────────────────────────────
    if (type === "order_placed") {
      const {
        to, merchantName, storeName, customerName,
        customerAddress, orderId, items = [],
        totalBaseCost, merchantProfit,
      } = body;

      const retail  = (items as any[]).reduce((a:number,i:any)=>(a+(i.unitPrice??0)*(i.quantity??1)),0) || (Number(totalBaseCost||0) + Number(merchantProfit||0));
      const cost    = Number(totalBaseCost || 0);
      const { customerPays, fee, merchantBack, profit } = calcF(retail, Number(merchantProfit||0));
      const shortId = (orderId ?? "").slice(-8).toUpperCase();

      const itemRows = (items as any[]).map((item:any) => `
<tr>
  <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:60px;">
    ${item.productImage
      ? `<img src="${item.productImage}" width="48" height="48" style="border-radius:10px;object-fit:cover;display:block;border:1px solid #e5e7eb;"/>`
      : `<div style="width:48px;height:48px;border-radius:10px;background:#f1f5f9;border:1px solid #e5e7eb;"></div>`}
  </td>
  <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
    <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px;">${item.productName}</div>
    ${item.size||item.color ? `<div style="font-size:11px;color:#94a3b8;">${[item.size,item.color].filter(Boolean).join(" · ")}</div>` : ""}
    <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Qty: ${item.quantity??1}</div>
  </td>
  <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:right;white-space:nowrap;">
    <div style="font-family:monospace;font-size:13px;font-weight:700;color:#0f172a;">$${((item.unitPrice??0)*(item.quantity??1)).toFixed(2)}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:2px;">×${item.quantity??1} @ $${Number(item.unitPrice??0).toFixed(2)}</div>
  </td>
</tr>`).join("");

      await send({
        from:FROM_ALERTS, to,
        subject:`Order confirmed for ${customerName} — #${shortId}`,
        html: wrap(`
${header(`Order Confirmed`,`#${shortId} · ${storeName}`)}
${section(`
<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 24px;">
  Hi <strong>${merchantName}</strong>, your order for
  <strong style="color:#0f172a;">${customerName}</strong> has been submitted and is now being processed.
</p>

${label("Order summary")}
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:24px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 16px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Product</td>
    <td style="padding:10px 16px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;"></td>
    <td style="padding:10px 16px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;text-align:right;">Amount</td>
  </tr>
  ${itemRows || `<tr><td colspan="3" style="padding:16px;font-size:13px;color:#94a3b8;text-align:center;">No items</td></tr>`}
</table>

${label("Financial breakdown")}
<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:14px;overflow:hidden;margin-bottom:24px;border:1px solid #e5e7eb;">
  <tr style="background:#0f172a;">
    <td colspan="2" style="padding:12px 16px;">
      <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:1px;">Your P&amp;L for this order</span>
    </td>
  </tr>
  ${[
    ["Merchant pays (retail)",          `$${retail.toFixed(2)}`,        "rgba(255,255,255,.6)","#1e293b"],
    ["Customer pays (+20%)",             `$${customerPays.toFixed(2)}`,   "rgba(255,255,255,.9)","#1e293b"],
    ["Platform fee (3% of customer)",    `−$${fee.toFixed(2)}`,           "#fbbf24",             "#1e293b"],
    ["Merchant receives back",           `$${merchantBack.toFixed(2)}`,   "#60a5fa",             "#1e293b"],
  ].map(([k,v,vc,bg])=>`
  <tr style="background:${bg};">
    <td style="padding:11px 16px;font-size:13px;color:rgba(255,255,255,.6);">${k}</td>
    <td style="padding:11px 16px;font-family:monospace;font-size:13px;font-weight:600;color:${vc};text-align:right;">${v}</td>
  </tr>`).join("")}
  <tr style="background:#0f172a;border-top:1px solid rgba(255,255,255,.08);">
    <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#c9a84c;">Your net profit (credited on delivery)</td>
    <td style="padding:14px 16px;font-family:monospace;font-size:18px;font-weight:800;color:#c9a84c;text-align:right;">+$${profit.toFixed(2)}</td>
  </tr>
</table>

${customerAddress ? `
${label("Delivering to")}
<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:24px;">
  <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">${customerName}</div>
  <div style="font-size:12px;color:#64748b;line-height:1.7;">${customerAddress}</div>
</div>` : ""}

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin-bottom:24px;text-align:center;">
  <div style="font-size:12px;color:#16a34a;font-weight:600;">
    💰 Customer pays <strong>$${customerPays.toFixed(2)}</strong> on delivery.
    After 3% fee, you net <strong>+$${profit.toFixed(2)}</strong> profit — credited to your wallet.
  </div>
</div>

${cta("Track This Order →", `${APP_URL}/merchant/orders`)}
`)}
`),
      });
      return NextResponse.json({ ok:true });
    }

    // ────────────────────────────────────────────────────────────
    // 6. ORDER STATUS UPDATE
    // ────────────────────────────────────────────────────────────
    if (type === "order_status_update") {
      const { to, merchantName, storeName, customerName,
        orderId, status, trackingNumber, merchantProfit } = body;

      const STATUS_INFO: Record<string,{emoji:string;title:string;msg:string;color:string;bg:string}> = {
        submitted:  { emoji:"📋", title:"Order Submitted",   color:"#2563eb", bg:"#eff6ff",
          msg:`Your order for <strong>${customerName}</strong> has been received by our fulfillment team and is being prepared for processing.` },
        processing: { emoji:"⚙️",  title:"Order Processing",  color:"#d97706", bg:"#fffbeb",
          msg:`Great news — your order for <strong>${customerName}</strong> is actively being packed and prepared for shipment.` },
        shipped:    { emoji:"🚚", title:"Order Shipped",     color:"#0891b2", bg:"#f0f9ff",
          msg:`Your order for <strong>${customerName}</strong> is on its way! The customer should receive it within the estimated delivery window.` },
        delivered:  { emoji:"✅", title:"Order Delivered!",  color:"#16a34a", bg:"#f0fdf4",
          msg:`Your order for <strong>${customerName}</strong> has been delivered successfully. Your profit has been credited to your wallet.` },
        cancelled:  { emoji:"❌", title:"Order Cancelled",   color:"#dc2626", bg:"#fef2f2",
          msg:`Your order for <strong>${customerName}</strong> has been cancelled. Contact support if you believe this is an error.` },
      };
      const st = STATUS_INFO[status] ?? { emoji:"📦", title:`Order ${status}`, color:"#0f172a", bg:"#f8fafc",
        msg:`Your order for <strong>${customerName}</strong> status has been updated.` };

      const shortId = (orderId ?? "").slice(-8).toUpperCase();
      const profit  = Number(merchantProfit || 0);

      await send({
        from:FROM_ALERTS, to,
        subject:`${st.emoji} ${st.title} — #${shortId} · ${storeName}`,
        html: wrap(`
${header(st.title, `Order #${shortId} · ${storeName}`)}
${section(`

${/* Status progress bar */statusBar(status)}

<div style="background:${st.bg};border-radius:14px;padding:20px 24px;margin-bottom:24px;text-align:center;">
  <div style="font-size:40px;margin-bottom:12px;">${st.emoji}</div>
  <p style="font-size:14px;color:#374151;line-height:1.8;margin:0;">${st.msg}</p>
</div>

${label("Order details")}
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
${[
  ["Order ID", `#${shortId}`],
  ["Customer", customerName],
  ["Store",    storeName],
  ...(trackingNumber ? [["Tracking Number", trackingNumber]] : []),
  ...(status==="delivered" && profit > 0 ? [["Profit Credited", `+$${profit.toFixed(2)}`]] : []),
].map(([k,v],i)=>`
<tr style="background:${i%2?"#f9fafb":"#fff"}">
  <td style="padding:11px 16px;font-size:12px;color:#64748b;font-weight:600;width:160px;">${k}</td>
  <td style="padding:11px 16px;font-size:13px;font-weight:600;color:${k==="Profit Credited"?"#16a34a":"#0f172a"};font-family:monospace;">${v}</td>
</tr>`).join("")}
</table>

${status === "delivered" ? `
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:14px;padding:24px;margin-bottom:24px;text-align:center;">
  <div style="font-size:12px;font-weight:700;color:rgba(201,168,76,.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Profit Credited to Wallet</div>
  <div style="font-size:32px;font-weight:900;color:#c9a84c;font-family:monospace;letter-spacing:-1px;">+$${profit.toFixed(2)}</div>
  <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:6px;">Net profit after 3% platform fee · Available in your wallet now</div>
</div>` : ""}

${trackingNumber && status === "shipped" ? `
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
  <div style="font-size:11px;font-weight:700;color:#0891b2;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Tracking Number</div>
  <div style="font-family:monospace;font-size:16px;font-weight:700;color:#0f172a;">${trackingNumber}</div>
  <div style="font-size:12px;color:#64748b;margin-top:4px;">Share this with your customer if needed.</div>
</div>` : ""}

${cta("View Order Details →", `${APP_URL}/merchant/orders`)}
`)}
`),
      });
      return NextResponse.json({ ok:true });
    }

    // ────────────────────────────────────────────────────────────
    // 7. STORE BLOCKED
    // ────────────────────────────────────────────────────────────
    if (type === "store_blocked") {
      const { to, name, storeName, reason, overdueCount } = body;
      await send({
        from:FROM_ALERTS, to,
        subject:`Your store "${storeName}" has been temporarily blocked`,
        html: wrap(`
<tr><td style="background:linear-gradient(135deg,#7f1d1d,#991b1b);padding:40px;text-align:center;">
  <div style="font-size:48px;margin-bottom:14px;">🔒</div>
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#fff;">Store Temporarily Blocked</h1>
  <p style="margin:0;font-size:13px;color:rgba(255,255,255,.5);">"${storeName}"</p>
</td></tr>
${section(`
<p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 24px;">
  Hi <strong>${name}</strong>, your store has been temporarily blocked.
  ${overdueCount ? `You have <strong style="color:#dc2626;">${overdueCount} pending order${overdueCount>1?"s":""}</strong> that were not submitted within the 48-hour window.` : ""}
</p>

${reason ? `
${label("Reason")}
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
  <div style="font-size:13px;color:#dc2626;font-weight:600;line-height:1.7;">${reason}</div>
</div>` : ""}

${label("To restore your store")}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
${[
  ["Submit pending orders","Log in and go to Orders. Submit any unprocessed orders immediately."],
  ["Contact support","Reach out via live chat or email to request reinstatement."],
  ["Avoid future blocks","Submit orders within 48 hours of receiving them."],
].map(([title,desc],i)=>`
<tr><td style="padding:6px 0;">
  <div style="background:${i%2?"#f9fafb":"#fff"};border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;display:flex;gap:12px;">
    <div style="width:26px;height:26px;border-radius:6px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:800;text-align:center;line-height:26px;flex-shrink:0;">${i+1}</div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">${title}</div>
      <div style="font-size:12px;color:#64748b;">${desc}</div>
    </div>
  </div>
</td></tr>`).join("")}
</table>

${cta("Go to Orders →", `${APP_URL}/merchant/orders`)}
<p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:14px;">
  Questions? Contact us at <a href="mailto:support@targetglobal.org" style="color:#94a3b8;">support@targetglobal.org</a>
</p>
`)}
`, 520),
      });
      return NextResponse.json({ ok:true });
    }

    return NextResponse.json({ error:`Unknown email type: ${type}` }, { status:400 });

  } catch (err:any) {
    console.error("[send-email] error:", err?.message ?? err);
    return NextResponse.json({ error:err?.message ?? "Email send failed." }, { status:500 });
  }
}
