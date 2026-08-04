// app/merchant/dashboard/page.tsx
"use client";
import Link from "next/link";
import { useMerchant } from "../layout";
import { useOrders, useWallet, useMerchantStore, useMerchantKYC } from "@/lib/hooks";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  blue:    "#2563eb",
  blueBg:  "rgba(37,99,235,.06)",
  blueBd:  "rgba(37,99,235,.18)",
  green:   "#16a34a",
  greenBg: "rgba(22,163,74,.07)",
  greenBd: "rgba(22,163,74,.18)",
  amber:   "#d97706",
  amberBg: "rgba(217,119,6,.07)",
  amberBd: "rgba(217,119,6,.18)",
  red:     "#dc2626",
  redBg:   "rgba(220,38,38,.06)",
  redBd:   "rgba(220,38,38,.18)",
  violet:  "#7c3aed",
  cyan:    "#0891b2",
  border:  "#e5e7eb",
  surface: "#f9fafb",
  text:    "#111827",
  muted:   "#6b7280",
  faint:   "#9ca3af",
} as const;

// ── Global styles (responsive breakpoints + hover) ─────────────────────────────
const CSS = `
  .dash-grid-3  { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .dash-split   { display:grid; grid-template-columns:1fr 1fr 1fr; }
  .dash-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .quick-action:hover { border-color:#2563eb !important; background:rgba(37,99,235,.04) !important; }
  @media (max-width:600px) {
    .dash-grid-3  { grid-template-columns:1fr 1fr; }
    .dash-split   { grid-template-columns:1fr; }
    .dash-split > *:not(:last-child) {
      border-bottom:1px solid #e5e7eb !important;
      border-right:none !important;
      padding-bottom:14px;
      margin-bottom:14px;
    }
    .dash-actions { grid-template-columns:1fr; }
  }
`;

// ── Reusable components ────────────────────────────────────────────────────────

/** Coloured pill badge for order status */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    pending:    { color: T.violet, bg: "rgba(124,58,237,.1)", label: "Pending"    },
    submitted:  { color: T.blue,   bg: T.blueBg,              label: "Submitted"  },
    processing: { color: T.amber,  bg: T.amberBg,             label: "Processing" },
    shipped:    { color: T.cyan,   bg: "rgba(8,145,178,.1)",  label: "Shipped"    },
    delivered:  { color: T.green,  bg: T.greenBg,             label: "Delivered"  },
    cancelled:  { color: T.red,    bg: T.redBd,               label: "Cancelled"  },
  };
  const s = map[status] ?? { color: T.muted, bg: "rgba(107,114,128,.1)", label: status };
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 10, fontWeight: 700,
      padding: "3px 9px", borderRadius: 99,
      color: s.color, background: s.bg, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

/** Single metric tile used inside the performance grid */
function StatTile({
  label, value, sub, color, large = false,
}: { label: string; value: string | number; sub: string; color: string; large?: boolean }) {
  const strVal = String(value);
  const fontSize = large ? 14 : strVal.length > 7 ? 15 : strVal.length > 4 ? 18 : 22;
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: "12px 14px", border: `1px solid ${T.border}` }}>
      <div style={{ fontWeight: 800, fontSize, color, marginBottom: 3, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: T.faint }}>{sub}</div>
    </div>
  );
}

/** White rounded card with consistent chrome */
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

/** Section heading row with an optional trailing node */
function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h2 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{children}</h2>
      {aside}
    </div>
  );
}

/** Inline contextual alert banner; accepts an optional CTA slot */
function Alert({
  variant, cta, children,
}: { variant: "blue" | "amber" | "red"; cta?: React.ReactNode; children: React.ReactNode }) {
  const styles = {
    blue:  { bg: T.blueBg,  bd: T.blueBd,  color: T.blue  },
    amber: { bg: T.amberBg, bd: T.amberBd, color: T.amber },
    red:   { bg: T.redBg,   bd: T.redBd,   color: T.red   },
  }[variant];
  return (
    <div role="alert" style={{
      background: styles.bg, border: `1px solid ${styles.bd}`,
      borderRadius: 12, padding: "12px 16px", marginBottom: 12,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      flexWrap: "wrap", gap: 8,
    }}>
      <span style={{ fontSize: 13, color: styles.color, fontWeight: 600 }}>{children}</span>
      {cta}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const ctx             = useMerchant();
  const { orders = [] } = useOrders(ctx.uid);
  const { wallet }      = useWallet(ctx.uid);
  const { store }       = useMerchantStore(ctx.uid);
  const { kyc }         = useMerchantKYC(ctx.uid);

  const isBlocked = store?.status === "blocked";
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const activeOrders    = orders.filter(o => o.status !== "cancelled");
  const deliveredOrders = orders.filter(o => o.status === "delivered");
  const pendingOrders   = orders.filter(o => o.status === "pending");

  const totalRevenue = activeOrders.reduce((a, o) => a + (o.total ?? 0), 0);
  const totalProfit  = deliveredOrders.reduce((a, o) => a + (o.merchantEarnings ?? 0), 0);
  const totalQty     = activeOrders.reduce(
    (a, o) => a + (o.items?.reduce((b: number, i: any) => b + (i.quantity ?? 1), 0) ?? 0), 0,
  );

  const todayOrders  = orders.filter(o => o.placedAt?.toDate?.().toDateString() === today);
  const yOrders      = orders.filter(o => o.placedAt?.toDate?.().toDateString() === yesterday);
  const todayRev     = todayOrders.filter(o => o.status !== "cancelled").reduce((a, o) => a + (o.total ?? 0), 0);
  const todayProfit  = todayOrders.filter(o => o.status === "delivered").reduce((a, o) => a + (o.merchantEarnings ?? 0), 0);
  const yRev         = yOrders.filter(o => o.status !== "cancelled").reduce((a, o) => a + (o.total ?? 0), 0);
  const revTrend     = yRev > 0
    ? `${todayRev >= yRev ? "+" : ""}${(((todayRev - yRev) / yRev) * 100).toFixed(0)}% vs yday`
    : undefined;

  const onTimeRate    = store?.totalOrders > 0
    ? Math.round(((store.onTimeOrders ?? 0) / store.totalOrders) * 100) : 100;
  const creditScore   = onTimeRate >= 90 ? 95 : onTimeRate >= 70 ? 75 : 50;
  const storeRating   = store?.rating ?? 0;
  const salesTarget   = store?.settings?.salesTarget ?? 10_000;
  const salesProgress = Math.min((totalRevenue / salesTarget) * 100, 100);

  const h     = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  // Last 7 days bar data
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000).toDateString();
    return orders
      .filter(o => o.placedAt?.toDate?.().toDateString() === d && o.status !== "cancelled")
      .reduce((a, o) => a + (o.total ?? 0), 0);
  });
  const maxBar = Math.max(...last7, 1);

  // Store status chip
  const statusChip: Record<string, { dot: string; text: string; bg: string; bd: string }> = {
    active:  { dot: T.green, text: T.green, bg: T.greenBg, bd: T.greenBd },
    pending: { dot: T.amber, text: T.amber, bg: T.amberBg, bd: T.amberBd },
    blocked: { dot: T.red,   text: T.red,   bg: T.redBg,   bd: T.redBd   },
  };
  const chip = statusChip[store?.status ?? ""] ?? { dot: T.faint, text: T.faint, bg: T.surface, bd: T.border };

  // Shared button style used in Wallet hero
  const ghostBtn: React.CSSProperties = {
    display: "block", padding: "10px", borderRadius: 12, textAlign: "center",
    border: "2px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.12)",
    color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none",
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 48px" }}>
      <style>{CSS}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-.5px", margin: "0 0 4px" }}>
            {greet}, {ctx.name.split(" ")[0]}! 👋
          </h1>
          <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>
            {ctx.storeName} · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: chip.bg, border: `1px solid ${chip.bd}` }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: chip.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: chip.text, textTransform: "capitalize" }}>
            {store?.status ?? "loading"}
          </span>
        </div>
      </div>

      {/* ── Blocked banner ──────────────────────────────────────────────────── */}
      {isBlocked && (
        <div role="alert" style={{ background: T.redBg, border: `2px solid ${T.redBd}`, borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span aria-hidden style={{ fontSize: 26, flexShrink: 0 }}>🚫</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 800, fontSize: 16, color: T.red, margin: "0 0 4px" }}>Store Blocked</p>
              <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, margin: "0 0 12px" }}>
                {store?.blockedReason || "Your store has been temporarily blocked. Please contact support."}
              </p>
              <Link href="/merchant/chat" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, background: T.red, color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                💬 Contact Support
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {!isBlocked && kyc?.status === "pending" && (
        <Alert variant="amber">
          ⏳ Identity verification in progress — your store will activate within 24 hours.
        </Alert>
      )}
      {!isBlocked && pendingOrders.length > 0 && (
        <Alert variant="blue" cta={
          <Link href="/merchant/orders" style={{ padding: "6px 14px", borderRadius: 8, background: T.blue, color: "#fff", fontWeight: 700, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>
            View Orders →
          </Link>
        }>
          ⚡ {pendingOrders.length} new order{pendingOrders.length > 1 ? "s" : ""} waiting — submit to process
        </Alert>
      )}

      {/* ── Performance stats ────────────────────────────────────────────────
          Single consolidated grid: today + all-time in one card.
          Wallet balance lives in the Wallet hero below — not repeated here.  */}
      <Card style={{ marginBottom: 14, opacity: isBlocked ? 0.7 : 1 }}>
        <CardTitle aside={<span style={{ fontSize: 11, color: T.faint }}>All time</span>}>
          Store Performance
        </CardTitle>

        {/* Today strip — 3 big numbers */}
        <div className="dash-split" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
          {([
            { l: "Today's Orders",  v: todayOrders.length,         sub: `${pendingOrders.length} pending`,  c: T.blue   },
            { l: "Today's Revenue", v: `$${todayRev.toFixed(2)}`,  sub: revTrend || "vs yesterday",         c: T.green  },
            { l: "Today's Profit",  v: `$${todayProfit.toFixed(2)}`, sub: "from deliveries",                c: T.violet },
          ] as const).map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "4px 12px", borderRight: i < 2 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontWeight: 900, fontSize: 26, color: s.c, letterSpacing: "-1px", lineHeight: 1, marginBottom: 3 }}>{s.v}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>{s.l}</div>
              <div style={{ fontSize: 11, color: T.faint }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* All-time 8-tile grid (wallet removed — lives in Wallet Hero) */}
        <div className="dash-grid-3" style={{ marginBottom: 14 }}>
          <StatTile
            label="Credit Score" sub={`${onTimeRate}% on-time`} value={creditScore}
            color={creditScore >= 80 ? T.green : creditScore >= 60 ? T.amber : T.red}
          />
          <StatTile label="Total Orders"   sub="all time"                           value={orders.length}                                             color={T.blue}   />
          <StatTile label="Units Ordered"  sub="cumulative"                         value={totalQty}                                                  color={T.violet} />
          <StatTile label="Total Revenue"  sub={`${activeOrders.length} orders`}    value={`$${totalRevenue.toFixed(2)}`}                             color={T.blue}   />
          <StatTile label="Total Profit"   sub={`${deliveredOrders.length} delivered`} value={`$${totalProfit.toFixed(2)}`}                           color={T.green}  />
          <StatTile
            label="Store Rating" sub={`${storeRating.toFixed(1)} / 5.0`}
            value={storeRating > 0
              ? "★".repeat(Math.round(storeRating)) + "☆".repeat(5 - Math.round(storeRating))
              : "☆☆☆☆☆"}
            color={T.amber} large
          />
        </div>

        {/* Sales target progress */}
        <div style={{ background: T.surface, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Monthly Sales Target</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: T.blue, fontWeight: 700 }}>{salesProgress.toFixed(0)}%</span>
          </div>
          <div
            role="progressbar" aria-valuenow={salesProgress} aria-valuemin={0} aria-valuemax={100}
            aria-label="Monthly sales target progress"
            style={{ height: 8, background: T.border, borderRadius: 99, overflow: "hidden", marginBottom: 6 }}
          >
            <div style={{ height: "100%", width: `${salesProgress}%`, background: `linear-gradient(90deg,#1d4ed8,${T.blue})`, borderRadius: 99, transition: "width .5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: T.faint }}>${totalRevenue.toFixed(0)} earned</span>
            <span style={{ fontSize: 10, color: T.faint }}>Goal: ${salesTarget.toLocaleString()}</span>
          </div>
        </div>
      </Card>

      {/* ── Wallet hero ─────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1a2744)", borderRadius: 20, padding: "22px 20px", marginBottom: 14, color: "#fff", opacity: isBlocked ? 0.7 : 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>Wallet Balance</div>
        <div style={{ fontWeight: 900, fontSize: 34, letterSpacing: "-1.5px", marginBottom: 4, color: "#c9a84c" }}>
          ${(wallet?.usdEquivalent ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: 12, opacity: 0.4, marginBottom: 18 }}>Available · BTC · ETH · USDT</div>
        {!isBlocked && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Link href="/merchant/wallet?tab=deposit"  style={ghostBtn}>↓ Deposit</Link>
            <Link href="/merchant/wallet?tab=withdraw" style={ghostBtn}>↑ Withdraw</Link>
          </div>
        )}
      </div>

      {/* ── Revenue chart — last 7 days ──────────────────────────────────────── */}
      <Card style={{ marginBottom: 14 }}>
        <CardTitle aside={
          <span style={{ fontFamily: "monospace", fontSize: 12, color: T.blue, fontWeight: 700 }}>
            ${last7.reduce((a, v) => a + v, 0).toFixed(0)} total
          </span>
        }>
          Revenue — Last 7 Days
        </CardTitle>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {last7.map((v, i) => {
            const day     = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][(new Date(Date.now() - (6 - i) * 86_400_000).getDay() + 6) % 7];
            const isToday = i === 6;
            const pct     = (v / maxBar) * 100;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                {v > 0
                  ? <div style={{ fontSize: 9, color: T.blue, fontWeight: 700, fontFamily: "monospace" }}>
                      ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
                    </div>
                  : <div style={{ fontSize: 9 }} />}
                <div style={{ width: "100%", borderRadius: "4px 4px 0 0", flex: 1, background: "#f3f4f6", position: "relative", overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    height: `${pct > 0 ? Math.max(pct, 6) : 0}%`,
                    background: isToday ? T.blue : "rgba(37,99,235,.28)",
                    transition: "height .4s cubic-bezier(.4,0,.2,1)",
                  }} />
                </div>
                <div style={{ fontSize: 9, color: isToday ? T.blue : T.faint, fontWeight: isToday ? 700 : 400 }}>{day}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Recent orders ────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 14 }}>
        <CardTitle aside={
          !isBlocked
            ? <Link href="/merchant/orders" style={{ fontSize: 12, color: T.blue, textDecoration: "none", fontWeight: 600 }}>View all →</Link>
            : undefined
        }>
          Recent Orders
        </CardTitle>

        {orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div aria-hidden style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
            <p style={{ fontWeight: 700, fontSize: 13, color: T.muted, margin: "0 0 4px" }}>No orders yet</p>
            <p style={{ fontSize: 12, color: T.faint, margin: 0 }}>Orders placed on your store will appear here</p>
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {orders.slice(0, 5).map(o => {
              const img = o.items?.[0]?.productImage || o.items?.[0]?.imageUrl;
              return (
                <li key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.surface}` }}>
                  <div aria-hidden style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: T.surface, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {img?.startsWith("http")
                      ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      : "📦"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer?.name}</div>
                    <div style={{ fontSize: 10, color: T.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.items?.map((i: any) => i.productName).join(", ")}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>${(o.total ?? 0).toFixed(2)}</div>
                    <StatusBadge status={o.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      {!isBlocked && (
        <Card>
          <CardTitle>Quick Actions</CardTitle>
          <div className="dash-actions">
            {([
              { l: "Browse Products", href: "/merchant/products?tab=catalog", icon: "📦", desc: "Add to your store" },
              { l: "View Orders",     href: "/merchant/orders",               icon: "🛒", desc: "Manage & submit"   },
              { l: "Deposit Funds",   href: "/merchant/wallet?tab=deposit",   icon: "💰", desc: "Top up wallet"     },
              { l: "Transactions",    href: "/merchant/transactions",          icon: "📊", desc: "View history"      },
            ] as const).map(a => (
              <Link key={a.l} href={a.href} className="quick-action" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${T.border}`, textDecoration: "none", background: "#fafbff", transition: "border-color .15s, background .15s" }}>
                <div aria-hidden style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: T.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {a.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 1 }}>{a.l}</div>
                  <div style={{ fontSize: 11, color: T.faint }}>{a.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
