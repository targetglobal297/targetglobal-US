// app/merchant/orders/page.tsx
"use client";
import { useState } from "react";
import { useMerchant } from "../layout";
import { useOrders, submitMerchantOrder } from "@/lib/hooks";
import { sendEmail } from "@/lib/email";
import toast from "react-hot-toast";

// ── Tokens ────────────────────────────────────────────────────
const NAVY = "#0f172a";
const BLUE = "#2563eb";
const GOLD = "#c9a84c";
const G = {
  green:"#16a34a", greenBg:"rgba(22,163,74,.08)", greenBd:"rgba(22,163,74,.2)",
  amber:"#d97706", amberBg:"rgba(217,119,6,.08)", amberBd:"rgba(217,119,6,.2)",
  red:  "#dc2626", redBg:  "rgba(220,38,38,.07)", redBd:  "rgba(220,38,38,.2)",
  violet:"#7c3aed",violetBg:"rgba(124,58,237,.08)",
  cyan: "#0891b2", cyanBg: "rgba(8,145,178,.08)",
  blue: BLUE,      blueBg: "rgba(37,99,235,.08)",  blueBd:"rgba(37,99,235,.2)",
  border:"#e5e7eb",surface:"#f8fafc",text:"#111827",muted:"#6b7280",faint:"#9ca3af",
};

// ── Financial model ───────────────────────────────────────────
// retail       = merchant pays this from wallet
// customerPays = retail × 1.20
// platformFee  = customerPays × 3%
// merchantBack = customerPays − platformFee  ← credited on delivery
// profit       = merchantBack − retail
function calcFin(order: any) {
  const retail       = order.total ?? order.totalRetailCost ?? 0;
  const customerPays = +(retail * 1.20).toFixed(2);
  const platformFee  = +(customerPays * 0.03).toFixed(2);
  const merchantBack = +(customerPays - platformFee).toFixed(2);
  const profit       = order.merchantEarnings > 0
    ? order.merchantEarnings
    : +(merchantBack - retail).toFixed(2);
  const margin = retail > 0 ? Math.round((profit / retail) * 100) : 0;
  return { retail, customerPays, platformFee, merchantBack, profit, margin };
}

// ── Icons ─────────────────────────────────────────────────────
function Ico({ d, s=16, c="currentColor", w=1.75 }: { d:string|string[]; s?:number; c?:string; w?:number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
    </svg>
  );
}
const I = {
  inbox:  "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
  check:  "M20 6L9 17l-5-5",
  truck:  ["M1 3h15v13H1z","M16 8h4l3 3v5h-7V8z","M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z","M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"],
  pkg:    ["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"],
  clock:  ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 6v6l4 2"],
  x:      "M18 6L6 18M6 6l12 12",
  chevD:  "M19 9l-7 7-7-7",
  chevU:  "M5 15l7-7 7 7",
  chevR:  "M9 18l6-6-6-6",
  search: ["M11 19a8 8 0 100-16 8 8 0 000 16z","M21 21l-4.35-4.35"],
  arrow:  "M5 12h14M12 5l7 7-7 7",
  info:   ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 8h.01","M12 12v4"],
  wallet: ["M21 12V7H5a2 2 0 010-4h14v4","M3 5v14a2 2 0 002 2h16v-5","M18 12a2 2 0 000 4h4v-4z"],
  user:   ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2","M12 11a4 4 0 100-8 4 4 0 000 8z"],
  map:    ["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z","M12 7a3 3 0 100 6 3 3 0 000-6z"],
  tag:    ["M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z","M7 7h.01"],
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  receipt:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 14l2 2 4-4",
};

// ── Status config ─────────────────────────────────────────────
const ST: Record<string,{label:string;c:string;bg:string;bd:string;icon:string|string[]}> = {
  pending:    { label:"Pending",    c:G.violet, bg:G.violetBg, bd:"rgba(124,58,237,.2)", icon:I.inbox   },
  submitted:  { label:"Submitted",  c:BLUE,     bg:G.blueBg,   bd:G.blueBd,              icon:I.receipt },
  processing: { label:"Processing", c:G.amber,  bg:G.amberBg,  bd:G.amberBd,             icon:I.clock   },
  shipped:    { label:"Shipped",    c:G.cyan,   bg:G.cyanBg,   bd:"rgba(8,145,178,.2)",  icon:I.truck   },
  delivered:  { label:"Delivered",  c:G.green,  bg:G.greenBg,  bd:G.greenBd,             icon:I.check   },
  cancelled:  { label:"Cancelled",  c:G.red,    bg:G.redBg,    bd:G.redBd,               icon:I.x       },
};
const PIPELINE = ["pending","submitted","processing","shipped","delivered"];

function Sk({ w="100%", h=14, r=6 }: { w?:string|number; h?:number; r?:number }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }}/>;
}

function Pill({ status }: { status:string }) {
  const s = ST[status] ?? ST.pending;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:99, fontSize:11, fontWeight:700, color:s.c, background:s.bg, border:`1px solid ${s.bd}` }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:s.c, flexShrink:0 }}/>
      {s.label}
    </span>
  );
}

// ── Progress timeline ─────────────────────────────────────────
function Timeline({ status }: { status:string }) {
  if (status === "cancelled") return (
    <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 0 2px" }}>
      <div style={{ width:7, height:7, borderRadius:"50%", background:G.red }}/>
      <span style={{ fontSize:11, color:G.red, fontWeight:600 }}>Order cancelled</span>
    </div>
  );
  const idx = PIPELINE.indexOf(status);
  const labels = ["Pending","Submitted","Processing","Shipped","Delivered"];
  return (
    <div style={{ padding:"10px 0 2px" }}>
      <div style={{ position:"relative", height:4, background:"#eef1f6", borderRadius:99, marginBottom:7 }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%", borderRadius:99, background:`linear-gradient(90deg,${G.green},${BLUE})`, width:`${Math.max(0,(idx/(PIPELINE.length-1))*100)}%`, transition:"width .5s cubic-bezier(.4,0,.2,1)" }}/>
        {PIPELINE.map((_,i) => {
          const done = i < idx, active = i === idx;
          return (
            <div key={i} title={labels[i]} style={{
              position:"absolute", top:"50%", left:`${(i/(PIPELINE.length-1))*100}%`,
              transform:"translate(-50%,-50%)",
              width:done||active?11:7, height:done||active?11:7, borderRadius:"50%",
              background:done?G.green:active?BLUE:"#fff",
              border:`2px solid ${done?G.green:active?BLUE:"#dfe4ec"}`,
              boxShadow:active?`0 0 0 3px ${BLUE}22`:"none",
              transition:"all .3s", zIndex:1,
            }}/>
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        {labels.map((l,i) => (
          <span key={l} style={{ fontSize:8.5, fontWeight:i===idx?700:500, flex:1, textAlign:i===0?"left":i===4?"right":"center", color:i<idx?G.green:i===idx?BLUE:"#cbd2dd" }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Money flow visual ─────────────────────────────────────────
function MoneyFlow({ retail, customerPays, platformFee, merchantBack, profit, compact = false }: {
  retail:number; customerPays:number; platformFee:number; merchantBack:number; profit:number; compact?:boolean;
}) {
  return (
    <div style={{ borderRadius:14, overflow:"hidden", border:`1px solid ${G.border}` }}>
      {/* Header */}
      <div style={{ background:NAVY, padding:"11px 15px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,.5)", textTransform:"uppercase" as const, letterSpacing:"1.2px" }}>
          Money Flow
        </span>
        <span style={{ fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:99, background:"rgba(201,168,76,.18)", color:GOLD, border:`1px solid rgba(201,168,76,.3)` }}>
          {retail > 0 ? `${Math.round((profit/retail)*100)}% return` : "—"}
        </span>
      </div>

      {/* Rows */}
      <div style={{ background:"#fff" }}>
        {[
          { l:"You pay now",       sub:"Deducted from wallet",       v:`−$${retail.toFixed(2)}`,       c:G.red,   icon:I.wallet, bg:G.redBg   },
          { l:"Customer pays",     sub:"Retail + 20% on delivery",   v:`$${customerPays.toFixed(2)}`,   c:NAVY,    icon:I.user,   bg:G.surface },
          { l:"Platform fee",      sub:"3% of customer payment",     v:`−$${platformFee.toFixed(2)}`,   c:G.amber, icon:I.tag,    bg:G.amberBg },
          { l:"You receive back",  sub:"Your cost + profit",         v:`+$${merchantBack.toFixed(2)}`,  c:BLUE,    icon:I.check,  bg:G.blueBg  },
        ].map((r,i) => (
          <div key={r.l} style={{ display:"flex", alignItems:"center", gap:11, padding:compact?"10px 15px":"12px 15px", borderBottom:`1px solid ${G.surface}` }}>
            <div style={{ width:30, height:30, borderRadius:8, background:r.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Ico d={r.icon} s={13} c={r.c}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12.5, fontWeight:600, color:G.text }}>{r.l}</div>
              {!compact && <div style={{ fontSize:10, color:G.faint, marginTop:1 }}>{r.sub}</div>}
            </div>
            <span style={{ fontFamily:"monospace", fontSize:13.5, fontWeight:700, color:r.c, flexShrink:0 }}>{r.v}</span>
          </div>
        ))}

        {/* Net profit */}
        <div style={{ display:"flex", alignItems:"center", gap:11, padding:"14px 15px", background:`linear-gradient(90deg,${G.greenBg},rgba(22,163,74,.03))` }}>
          <div style={{ width:34, height:34, borderRadius:9, background:G.green, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:`0 3px 10px ${G.green}40` }}>
            <Ico d={I.dollar} s={16} c="#fff" w={2}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:800, color:G.green }}>Your net profit</div>
            <div style={{ fontSize:10, color:G.muted, marginTop:1 }}>
              ${merchantBack.toFixed(2)} back − ${retail.toFixed(2)} paid
            </div>
          </div>
          <span style={{ fontFamily:"monospace", fontSize:19, fontWeight:900, color:G.green, letterSpacing:"-.5px" }}>
            +${profit.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Confirm sheet ─────────────────────────────────────────────
function ConfirmSheet({ order, onConfirm, onCancel, submitting }: {
  order:any; onConfirm:()=>void; onCancel:()=>void; submitting:boolean;
}) {
  const f = calcFin(order);
  const addr = order.customer?.address;

  return (
    <>
      <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:200, backdropFilter:"blur(4px)" }}/>
      <div role="dialog" aria-modal="true" style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:201, background:"#fff", borderRadius:"24px 24px 0 0", maxHeight:"92dvh", overflowY:"auto", padding:"0 0 max(24px,env(safe-area-inset-bottom))", animation:"sheetUp .3s cubic-bezier(.34,1.1,.64,1)" }}>

        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"14px 0 6px", position:"sticky", top:0, background:"#fff", zIndex:2 }}>
          <div style={{ width:40, height:4, borderRadius:99, background:"#e2e8f0" }}/>
        </div>

        <div style={{ padding:"4px 20px 20px" }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
            <div>
              <h2 style={{ fontWeight:800, fontSize:19, color:NAVY, margin:"0 0 3px", letterSpacing:"-.5px" }}>Review Order</h2>
              <p style={{ fontSize:12, color:G.muted, margin:0 }}>Confirm before submitting</p>
            </div>
            <button type="button" onClick={onCancel}
              style={{ width:34, height:34, borderRadius:10, border:`1px solid ${G.border}`, background:G.surface, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Ico d={I.x} s={15} c={G.muted}/>
            </button>
          </div>

          {/* Customer */}
          <div style={{ background:G.surface, borderRadius:14, padding:"14px 16px", marginBottom:12, border:`1px solid ${G.border}`, display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:NAVY, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Ico d={I.user} s={17} c={GOLD} w={1.5}/>
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:14, color:NAVY, marginBottom:2 }}>{order.customer?.name ?? "Customer"}</div>
              <div style={{ fontSize:11.5, color:G.muted, display:"flex", alignItems:"center", gap:4 }}>
                <Ico d={I.map} s={11} c={G.faint}/>
                {[addr?.city, addr?.country].filter(Boolean).join(", ") || "—"}
              </div>
            </div>
          </div>

          {/* Items */}
          {order.items?.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:G.faint, textTransform:"uppercase" as const, letterSpacing:"1.2px", marginBottom:8 }}>
                {order.items.length} Item{order.items.length>1?"s":""}
              </div>
              <div style={{ border:`1px solid ${G.border}`, borderRadius:13, overflow:"hidden" }}>
                {order.items.map((it:any, i:number) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 13px", background:i%2===0?"#fff":G.surface, borderBottom:i<order.items.length-1?`1px solid ${G.border}`:"none" }}>
                    <div style={{ width:42, height:42, borderRadius:10, overflow:"hidden", background:G.surface, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${G.border}` }}>
                      {(it.productImage||it.imageUrl)?.startsWith?.("http")
                        ? <img src={it.productImage||it.imageUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                        : <Ico d={I.pkg} s={18} c="#c4c4c4"/>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {it.productName}
                      </div>
                      {(it.size||it.color) && (
                        <div style={{ fontSize:10.5, color:G.faint, marginTop:2 }}>
                          {[it.size,it.color].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                      <div style={{ fontFamily:"monospace", fontWeight:700, fontSize:12.5, color:NAVY }}>
                        ${((it.unitPrice??0)*(it.quantity??1)).toFixed(2)}
                      </div>
                      <div style={{ fontSize:9.5, color:G.faint, marginTop:1 }}>×{it.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Money flow */}
          <div style={{ marginBottom:14 }}>
            <MoneyFlow {...f}/>
          </div>

          {/* Notice */}
          <div style={{ display:"flex", gap:10, background:G.blueBg, border:`1px solid ${G.blueBd}`, borderRadius:12, padding:"12px 14px", marginBottom:18 }}>
            <Ico d={I.info} s={15} c={BLUE} w={2}/>
            <p style={{ fontSize:12, color:"#475569", lineHeight:1.7, margin:0 }}>
              <strong style={{ color:NAVY }}>${f.retail.toFixed(2)}</strong> comes out of your wallet now.
              On delivery you get <strong style={{ color:BLUE }}>${f.merchantBack.toFixed(2)}</strong> back —
              your cost returned plus <strong style={{ color:G.green }}>${f.profit.toFixed(2)} profit</strong>.
            </p>
          </div>

          {/* Actions */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2.2fr", gap:10 }}>
            <button type="button" onClick={onCancel}
              style={{ padding:"14px", borderRadius:12, cursor:"pointer", border:`1.5px solid ${G.border}`, background:"transparent", color:G.muted, fontWeight:600, fontSize:14 }}>
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={submitting}
              style={{ padding:"14px", borderRadius:12, cursor:submitting?"not-allowed":"pointer", border:"none", background:submitting?"rgba(15,23,42,.35)":`linear-gradient(135deg,${NAVY},#1e3a6e)`, color:GOLD, fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:submitting?"none":"0 4px 14px rgba(15,23,42,.25)" }}>
              {submitting
                ? <><span style={{ width:14, height:14, borderRadius:"50%", border:"2.5px solid rgba(255,255,255,.3)", borderTopColor:GOLD, animation:"spin .7s linear infinite", display:"inline-block" }}/> Submitting…</>
                : <>Confirm & Submit <Ico d={I.arrow} s={15} c={GOLD} w={2}/></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Order card ────────────────────────────────────────────────
function OrderCard({ order, expanded, onToggle, onSubmit }: {
  order:any; expanded:boolean; onToggle:()=>void; onSubmit:()=>void;
}) {
  const f    = calcFin(order);
  const s    = ST[order.status] ?? ST.pending;
  const img  = order.items?.[0]?.productImage ?? order.items?.[0]?.imageUrl;
  const n    = order.items?.length ?? 0;
  const date = order.placedAt?.toDate?.();

  return (
    <div style={{ background:"#fff", borderRadius:16, overflow:"hidden", border:`1.5px solid ${expanded?BLUE:"#e8ecf3"}`, boxShadow:expanded?`0 8px 28px ${BLUE}12`:"0 1px 3px rgba(0,0,0,.04)", transition:"all .25s" }}>

      {/* Status bar */}
      <div style={{ height:3, background:s.c }}/>

      {/* Main row */}
      <div onClick={onToggle} style={{ padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ position:"relative", flexShrink:0 }}>
          <div style={{ width:52, height:52, borderRadius:13, overflow:"hidden", background:G.surface, border:`1px solid ${G.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {img?.startsWith?.("http")
              ? <img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e => { (e.currentTarget as any).style.display="none"; }}/>
              : <Ico d={I.pkg} s={22} c="#c4c4c4"/>}
          </div>
          {n > 1 && (
            <div style={{ position:"absolute", bottom:-4, right:-4, minWidth:19, height:19, padding:"0 4px", borderRadius:99, background:NAVY, border:"2px solid #fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:"#fff" }}>
              {n}
            </div>
          )}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5, flexWrap:"wrap" as const }}>
            <span style={{ fontWeight:700, fontSize:14, color:NAVY }}>{order.customer?.name ?? "Customer"}</span>
            <Pill status={order.status}/>
          </div>
          <div style={{ fontSize:10.5, color:G.faint }}>
            {order.storeName}
            {date && ` · ${date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
            {n > 0 && ` · ${n} item${n>1?"s":""}`}
          </div>
        </div>

        <div style={{ textAlign:"right" as const, flexShrink:0 }}>
          <div style={{ fontWeight:800, fontSize:15, color:NAVY, fontFamily:"monospace", letterSpacing:"-.5px", marginBottom:2 }}>
            ${f.retail.toFixed(2)}
          </div>
          <div style={{ fontSize:11.5, fontWeight:700, color:G.green, fontFamily:"monospace" }}>
            +${f.profit.toFixed(2)}
          </div>
        </div>

        <Ico d={expanded?I.chevU:I.chevD} s={14} c={G.faint}/>
      </div>

      {/* Timeline */}
      <div style={{ padding:"0 16px 12px" }}>
        <Timeline status={order.status}/>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop:`1px solid ${G.surface}`, background:"#fcfdff" }}>
          <div style={{ padding:"16px" }}>

            {/* Money flow */}
            <div style={{ marginBottom:14 }}>
              <MoneyFlow {...f} compact/>
            </div>

            {/* Items */}
            {order.items?.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:G.faint, textTransform:"uppercase" as const, letterSpacing:"1.2px", marginBottom:8 }}>
                  Items ordered
                </div>
                <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:12, overflow:"hidden" }}>
                  {order.items.map((it:any, i:number) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 13px", borderBottom:i<order.items.length-1?`1px solid ${G.surface}`:"none" }}>
                      <div style={{ width:36, height:36, borderRadius:9, overflow:"hidden", background:G.surface, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {(it.productImage||it.imageUrl)?.startsWith?.("http")
                          ? <img src={it.productImage||it.imageUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                          : <Ico d={I.pkg} s={16} c="#c4c4c4"/>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12.5, fontWeight:500, color:NAVY, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                          {it.productName}
                        </div>
                        <div style={{ fontSize:10, color:G.faint, marginTop:1 }}>
                          {[it.size,it.color].filter(Boolean).join(" · ")} · Qty {it.quantity}
                        </div>
                      </div>
                      <div style={{ fontFamily:"monospace", fontWeight:600, fontSize:12.5, color:NAVY, flexShrink:0 }}>
                        ${((it.unitPrice??0)*(it.quantity??1)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer + Order info */}
            <div className="ord-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:9.5, fontWeight:700, color:G.faint, textTransform:"uppercase" as const, letterSpacing:"1.2px", marginBottom:9, display:"flex", alignItems:"center", gap:5 }}>
                  <Ico d={I.user} s={10} c={G.faint}/> Customer
                </div>
                <div style={{ fontWeight:600, fontSize:12.5, color:NAVY, marginBottom:5 }}>{order.customer?.name}</div>
                <div style={{ fontSize:10.5, color:G.muted, lineHeight:1.85 }}>
                  {order.customer?.email && <>{order.customer.email}<br/></>}
                  {order.customer?.phone && <>{order.customer.phone}<br/></>}
                  {order.customer?.address?.line1 && <>{order.customer.address.line1}<br/></>}
                  {[order.customer?.address?.city, order.customer?.address?.country].filter(Boolean).join(", ")}
                </div>
              </div>

              <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:9.5, fontWeight:700, color:G.faint, textTransform:"uppercase" as const, letterSpacing:"1.2px", marginBottom:9, display:"flex", alignItems:"center", gap:5 }}>
                  <Ico d={I.tag} s={10} c={G.faint}/> Order Info
                </div>
                <div style={{ fontSize:10.5, lineHeight:2.1 }}>
                  {[
                    ["Order ID", `#${order.id?.slice(-8).toUpperCase()}`],
                    ["Placed",   date ? date.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"],
                    ["Items",    `${n} product${n!==1?"s":""}`],
                    ...(order.trackingNumber ? [["Tracking", order.trackingNumber]] : []),
                  ].map(([k,v]) => (
                    <div key={k as string} style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                      <span style={{ color:G.muted }}>{k}</span>
                      <span style={{ fontWeight:600, color:k==="Tracking"?BLUE:NAVY, fontFamily:"monospace", fontSize:10.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, maxWidth:110 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Payout banner */}
            {order.status === "delivered" && (
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px", borderRadius:13, marginBottom:14, background:order.fundsReimbursed?G.greenBg:G.amberBg, border:`1px solid ${order.fundsReimbursed?G.greenBd:G.amberBd}` }}>
                <div style={{ width:38, height:38, borderRadius:11, flexShrink:0, background:order.fundsReimbursed?"rgba(22,163,74,.14)":"rgba(217,119,6,.14)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Ico d={order.fundsReimbursed?I.check:I.clock} s={18} c={order.fundsReimbursed?G.green:G.amber} w={2}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:order.fundsReimbursed?G.green:G.amber, marginBottom:2 }}>
                    {order.fundsReimbursed
                      ? `$${(order.reimbursedAmount ?? f.merchantBack).toFixed(2)} credited to your wallet`
                      : "Awaiting delivery confirmation"}
                  </div>
                  <div style={{ fontSize:11, color:G.muted }}>
                    {order.fundsReimbursed
                      ? `Your $${f.retail.toFixed(2)} back + $${f.profit.toFixed(2)} profit`
                      : `You'll get $${f.merchantBack.toFixed(2)} — cost + profit`}
                  </div>
                </div>
              </div>
            )}

            {/* Submit CTA */}
            {order.status === "pending" && (
              <button type="button" onClick={e => { e.stopPropagation(); onSubmit(); }}
                style={{ width:"100%", padding:"14px", borderRadius:13, border:"none", cursor:"pointer", background:`linear-gradient(135deg,${NAVY},#1e3a6e)`, color:GOLD, fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 4px 16px rgba(15,23,42,.22)", transition:"all .2s" }}
                onMouseEnter={e => ((e.currentTarget as any).style.opacity=".9")}
                onMouseLeave={e => ((e.currentTarget as any).style.opacity="1")}>
                Submit Order · Earn ${f.profit.toFixed(2)}
                <Ico d={I.arrow} s={15} c={GOLD} w={2}/>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrdersPage() {
  const ctx = useMerchant();
  const { orders = [], loading } = useOrders(ctx.uid);

  const [filter,       setFilter]       = useState("all");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState<string|null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmOrder, setConfirmOrder] = useState<any>(null);

  const active     = orders.filter((o:any) => o.status !== "cancelled");
  const pending    = orders.filter((o:any) => o.status === "pending");
  const inProgress = orders.filter((o:any) => ["submitted","processing","shipped"].includes(o.status));
  const delivered  = orders.filter((o:any) => o.status === "delivered");

  const allFin       = orders.map((o:any) => calcFin(o));
  const totalPaid    = allFin.reduce((a,f) => a + f.retail, 0);
  const totalFees    = allFin.reduce((a,f) => a + f.platformFee, 0);
  const earnedProfit = delivered.reduce((a:number,o:any) => a + calcFin(o).profit, 0);
  const pendingBack  = inProgress.reduce((a:number,o:any) => a + calcFin(o).merchantBack, 0);

  const ACTIVE = ["submitted","processing","shipped"];
  const filtered = orders.filter((o:any) => {
    const mf = filter==="all" ? true : filter==="active" ? ACTIVE.includes(o.status) : o.status===filter;
    const ms = !search ||
      o.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.storeName?.toLowerCase().includes(search.toLowerCase()) ||
      o.id?.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  const FILTERS = [
    { key:"all",       label:"All",       count:orders.length },
    { key:"pending",   label:"Pending",   count:pending.length },
    { key:"active",    label:"Active",    count:inProgress.length },
    { key:"delivered", label:"Delivered", count:delivered.length },
    { key:"cancelled", label:"Cancelled", count:orders.filter((o:any)=>o.status==="cancelled").length },
  ];

  async function handleSubmit() {
    if (!confirmOrder) return;
    setSubmitting(true);
    try {
      await submitMerchantOrder({
        orderId:         confirmOrder.id,
        merchantId:      ctx.uid,
        storeId:         ctx.storeId,
        storeName:       ctx.storeName,
        merchantEmail:   ctx.email,
        totalBaseCost:   confirmOrder.totalBaseCost ?? 0,
        totalRetailCost: confirmOrder.total ?? 0,
        storeSettings:   { deliveryDays:3, commissionRate:0.03 },
      });
      toast.success("Order submitted!");
      if (ctx.email) {
        const f = calcFin(confirmOrder);
        const addr = confirmOrder?.customer?.address;
        sendEmail({
          type:            "order_placed",
          to:              ctx.email,
          merchantName:    ctx.name,
          storeName:       ctx.storeName,
          customerName:    confirmOrder?.customer?.name ?? "Customer",
          customerAddress: addr ? [addr.line1,addr.city,addr.country].filter(Boolean).join(", ") : undefined,
          orderId:         confirmOrder?.id ?? "",
          items: (confirmOrder?.items ?? []).map((it:any) => ({
            productName:it.productName, productImage:it.productImage??it.imageUrl,
            size:it.size, color:it.color, quantity:it.quantity??1, unitPrice:it.unitPrice??0,
          })),
          totalBaseCost:  confirmOrder?.totalBaseCost ?? 0,
          merchantProfit: f.profit,
        }).catch(() => {});
      }
      setConfirmOrder(null);
      setExpanded(null);
    } catch (e:any) {
      toast.error(e.message || "Failed to submit order.");
    }
    setSubmitting(false);
  }

  return (
    <div style={{ maxWidth:700, margin:"0 auto", paddingBottom:80 }}>
      <style>{`
        @keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        .no-sb::-webkit-scrollbar{display:none} .no-sb{scrollbar-width:none}
        .ord-grid { grid-template-columns:1fr 1fr; }
        .sum-grid { display:grid; grid-template-columns:repeat(4,1fr); }
        @media(max-width:600px){
          .ord-grid { grid-template-columns:1fr!important; }
          .sum-grid { grid-template-columns:repeat(2,1fr)!important; }
          .sum-grid > div:nth-child(-n+2) { border-bottom:1px solid rgba(255,255,255,.08)!important; }
          .sum-grid > div:nth-child(2n) { border-right:none!important; }
        }
      `}</style>

      {/* Confirm sheet */}
      {confirmOrder && (
        <ConfirmSheet order={confirmOrder} onConfirm={handleSubmit}
          onCancel={() => setConfirmOrder(null)} submitting={submitting}/>
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom:18 }}>
        <h1 style={{ fontWeight:900, fontSize:24, color:NAVY, letterSpacing:"-1px", margin:"0 0 4px" }}>Orders</h1>
        <p style={{ fontSize:13, color:G.muted, margin:0 }}>
          {loading ? "Loading…" : `${orders.length} order${orders.length!==1?"s":""} · you get cost + profit back on delivery`}
        </p>
      </div>

      {/* ── Summary strip ── */}
      <div style={{ background:`linear-gradient(135deg,${NAVY},#1e3a6e)`, borderRadius:18, marginBottom:14, overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", right:-40, top:-40, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,.03)", pointerEvents:"none" }}/>
        <div className="sum-grid" style={{ position:"relative" }}>
          {[
            { l:"Total Paid",      v:`$${totalPaid.toFixed(0)}`,    c:"rgba(255,255,255,.85)", sub:"from wallet"          },
            { l:"Platform Fees",   v:`$${totalFees.toFixed(0)}`,    c:"#fbbf24",               sub:"3% commission"        },
            { l:"Coming Back",     v:`$${pendingBack.toFixed(0)}`,  c:"#60a5fa",               sub:`${inProgress.length} in transit` },
            { l:"Profit Earned",   v:`$${earnedProfit.toFixed(0)}`, c:GOLD,                    sub:`${delivered.length} delivered`   },
          ].map((s,i,arr) => (
            <div key={s.l} style={{ padding:"16px 12px", textAlign:"center" as const, borderRight:i<arr.length-1?"1px solid rgba(255,255,255,.08)":"none" }}>
              {loading
                ? <><Sk h={20} w="60%" r={5}/><div style={{height:6}}/><Sk h={10} w="75%" r={4}/></>
                : <>
                    <div style={{ fontFamily:"monospace", fontWeight:900, fontSize:19, color:s.c, letterSpacing:"-.5px", marginBottom:4 }}>{s.v}</div>
                    <div style={{ fontSize:10.5, color:"rgba(255,255,255,.55)", fontWeight:600, marginBottom:1 }}>{s.l}</div>
                    <div style={{ fontSize:9, color:"rgba(255,255,255,.28)" }}>{s.sub}</div>
                  </>
              }
            </div>
          ))}
        </div>
      </div>

      {/* ── Pending alert ── */}
      {pending.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:13, marginBottom:12, background:G.violetBg, border:`1px solid rgba(124,58,237,.2)` }}>
          <div style={{ width:34, height:34, borderRadius:10, background:"rgba(124,58,237,.14)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Ico d={I.inbox} s={16} c={G.violet}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:G.violet, fontWeight:700, marginBottom:1 }}>
              {pending.length} order{pending.length>1?"s":""} waiting
            </div>
            <div style={{ fontSize:11, color:G.muted }}>Submit within 48hrs to avoid auto-block</div>
          </div>
          <button type="button" onClick={() => setFilter("pending")}
            style={{ padding:"7px 14px", borderRadius:9, border:`1.5px solid ${G.violet}`, background:"transparent", color:G.violet, fontWeight:700, fontSize:12, cursor:"pointer", flexShrink:0 }}>
            View
          </button>
        </div>
      )}

      {/* ── Search ── */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <div style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
          <Ico d={I.search} s={14} c={G.faint}/>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer, store or order ID…"
          style={{ width:"100%", padding:"11px 14px 11px 38px", border:`1.5px solid ${G.border}`, borderRadius:12, fontSize:13, outline:"none", background:"#fff", color:NAVY, boxSizing:"border-box" as const, transition:"border .15s" }}
          onFocus={e => (e.target.style.borderColor=BLUE)}
          onBlur={e  => (e.target.style.borderColor=G.border)}/>
      </div>

      {/* ── Filters ── */}
      <div className="no-sb" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:14, paddingBottom:2 }}>
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:99, cursor:"pointer", fontSize:12, fontWeight:filter===f.key?700:500, whiteSpace:"nowrap" as const, flexShrink:0, transition:"all .15s", border:`1.5px solid ${filter===f.key?NAVY:G.border}`, background:filter===f.key?NAVY:"#fff", color:filter===f.key?"#fff":G.muted }}>
            {f.label}
            {f.count > 0 && (
              <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, fontFamily:"monospace", fontWeight:700, background:filter===f.key?"rgba(255,255,255,.18)":"rgba(15,23,42,.06)", color:filter===f.key?"#fff":G.muted }}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ display:"grid", gap:10 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, overflow:"hidden" }}>
              <div style={{ height:3, background:"#f0f0f0" }}/>
              <div style={{ padding:16, display:"flex", gap:12, alignItems:"center" }}>
                <Sk w={52} h={52} r={13}/>
                <div style={{ flex:1 }}><Sk h={14} w="45%" r={4}/><div style={{height:7}}/><Sk h={10} w="65%" r={4}/></div>
                <div style={{ width:70 }}><Sk h={16} w="100%" r={4}/><div style={{height:6}}/><Sk h={12} w="80%" r={4}/></div>
              </div>
              <div style={{ padding:"0 16px 14px" }}><Sk h={4} r={99}/></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, padding:"52px 24px", textAlign:"center" as const }}>
          <div style={{ width:60, height:60, borderRadius:17, background:G.surface, border:`1px solid ${G.border}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 15px" }}>
            <Ico d={I.inbox} s={26} c="#c4c4c4" w={1.5}/>
          </div>
          <p style={{ fontWeight:700, fontSize:16, color:NAVY, margin:"0 0 6px" }}>
            {search ? "No orders match your search" : filter!=="all" ? `No ${filter} orders` : "No orders yet"}
          </p>
          <p style={{ fontSize:13, color:G.muted, margin:"0 0 16px", lineHeight:1.65 }}>
            {search || filter!=="all"
              ? "Try a different search or filter"
              : "Orders from your store will appear here"}
          </p>
          {(search || filter!=="all") && (
            <button type="button" onClick={() => { setSearch(""); setFilter("all"); }}
              style={{ padding:"9px 22px", borderRadius:10, border:`1.5px solid ${G.border}`, background:"transparent", color:G.muted, fontWeight:600, fontSize:13, cursor:"pointer" }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:"grid", gap:10 }}>
          {filtered.map((o:any) => (
            <OrderCard key={o.id} order={o}
              expanded={expanded===o.id}
              onToggle={() => setExpanded(expanded===o.id?null:o.id)}
              onSubmit={() => setConfirmOrder(o)}/>
          ))}
        </div>
      )}
    </div>
  );
}