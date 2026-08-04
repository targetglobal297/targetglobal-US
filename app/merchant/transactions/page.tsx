// app/merchant/transactions/page.tsx
"use client";
import { useState, useMemo } from "react";
import { useMerchant } from "../layout";
import { useMerchantTransactions } from "@/lib/hooks";
import toast from "react-hot-toast";

// ── Tokens ────────────────────────────────────────────────────
const NAVY = "#0f172a";
const BLUE = "#2563eb";
const GOLD = "#c9a84c";
const G = {
  green:"#16a34a", greenBg:"rgba(22,163,74,.08)", greenBd:"rgba(22,163,74,.2)",
  amber:"#d97706", amberBg:"rgba(217,119,6,.08)", amberBd:"rgba(217,119,6,.2)",
  red:  "#dc2626", redBg:  "rgba(220,38,38,.07)", redBd:  "rgba(220,38,38,.2)",
  blue: BLUE,      blueBg: "rgba(37,99,235,.08)",  blueBd:"rgba(37,99,235,.2)",
  border:"#e5e7eb",surface:"#f8fafc",text:"#111827",muted:"#6b7280",faint:"#9ca3af",
};

const COIN: Record<string,{color:string;bg:string;sym:string}> = {
  BTC:  { color:"#f7931a", bg:"rgba(247,147,26,.1)", sym:"₿" },
  ETH:  { color:"#627eea", bg:"rgba(98,126,234,.1)", sym:"Ξ" },
  USDT: { color:"#26a17b", bg:"rgba(38,161,123,.1)", sym:"₮" },
};

const TX_TYPES: Record<string,{label:string;icon:string|string[];color:string;bg:string;isIn:boolean}> = {
  deposit:         { label:"Deposit",         icon:"M12 5v14M5 12l7-7 7 7",                                       color:G.green, bg:G.greenBg, isIn:true  },
  earning:         { label:"Order Earnings",  icon:["M12 1v22","M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"],  color:G.green, bg:G.greenBg, isIn:true  },
  withdrawal:      { label:"Withdrawal",      icon:"M12 19V5M5 12l7 7 7-7",                                       color:G.red,   bg:G.redBg,   isIn:false },
  order_deduction: { label:"Order Payment",   icon:["M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z","M3 6h18","M16 10a4 4 0 01-8 0"], color:G.red, bg:G.redBg, isIn:false },
};

// ── SVG icon ──────────────────────────────────────────────────
function Ico({ d, s=16, c="currentColor", w=1.75 }: { d:string|string[]; s?:number; c?:string; w?:number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
    </svg>
  );
}

function Sk({ w="100%", h=14, r=6 }: { w?:string|number; h?:number; r?:number }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }}/>;
}

// ── Date helpers ──────────────────────────────────────────────
function fmtDateTime(d: Date | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month:"short", day:"numeric", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true,
  });
}
function fmtTime(d: Date | undefined) {
  if (!d) return "—";
  return d.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:true });
}

// ── Main page ─────────────────────────────────────────────────
export default function TransactionsPage() {
  const ctx = useMerchant();
  const { data: txns = [], loading } = useMerchantTransactions(ctx.uid);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // ── Filtered ──
  const filtered = useMemo(() => txns.filter((t:any) => {
    const mf =
      filter === "all"     ? true :
      filter === "in"      ? ["deposit","earning"].includes(t.type) :
      filter === "out"     ? ["withdrawal","order_deduction"].includes(t.type) :
      ["BTC","ETH","USDT"].includes(filter) ? t.coin === filter :
      t.type === filter;
    const ms = !search ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.txHash?.toLowerCase().includes(search.toLowerCase()) ||
      t.coin?.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  }), [txns, filter, search]);

  // ── Stats ──
  const confirmed  = txns.filter((t:any) => t.status === "confirmed");
  const totalIn    = confirmed.filter((t:any) => ["deposit","earning"].includes(t.type)).reduce((a:number,t:any) => a+(t.usdValue??0), 0);
  const totalOut   = confirmed.filter((t:any) => ["withdrawal","order_deduction"].includes(t.type)).reduce((a:number,t:any) => a+(t.usdValue??0), 0);
  const earnings   = confirmed.filter((t:any) => t.type === "earning").reduce((a:number,t:any) => a+(t.usdValue??0), 0);
  const netFlow    = totalIn - totalOut;

  // ── Group by date ──
  const grouped = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const yest  = new Date(today); yest.setDate(yest.getDate()-1);
    const week  = new Date(today); week.setDate(week.getDate()-7);

    const groups: { label:string; items:any[] }[] = [
      { label:"Today",         items:[] },
      { label:"Yesterday",     items:[] },
      { label:"This Week",     items:[] },
      { label:"Earlier",       items:[] },
    ];
    filtered.forEach((t:any) => {
      const d = t.createdAt?.toDate?.();
      if      (!d)            groups[3].items.push(t);
      else if (d >= today)    groups[0].items.push(t);
      else if (d >= yest)     groups[1].items.push(t);
      else if (d >= week)     groups[2].items.push(t);
      else                    groups[3].items.push(t);
    });
    return groups.filter(g => g.items.length > 0);
  }, [filtered]);

  // ── CSV export ──
  function exportCSV() {
    if (txns.length === 0) { toast.error("No transactions to export"); return; }
    const rows = [
      ["Date","Type","Coin","Network","Amount","USD Value","Status","Description","Tx Hash"],
      ...txns.map((t:any) => [
        fmtDateTime(t.createdAt?.toDate?.()),
        TX_TYPES[t.type]?.label ?? t.type,
        t.coin ?? "",
        t.network ?? "",
        t.amount ?? "",
        (t.usdValue ?? 0).toFixed(2),
        t.status ?? "",
        (t.description ?? "").replace(/,/g, ";"),
        t.txHash ?? "",
      ]),
    ];
    const csv  = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `targetglobal-transactions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transactions exported");
  }

  function copyHash(hash: string) {
    navigator.clipboard?.writeText(hash);
    toast.success("Transaction hash copied");
  }

  const FILTERS = [
    { key:"all",             label:"All",        count:txns.length },
    { key:"in",              label:"Money In",   count:txns.filter((t:any)=>["deposit","earning"].includes(t.type)).length },
    { key:"out",             label:"Money Out",  count:txns.filter((t:any)=>["withdrawal","order_deduction"].includes(t.type)).length },
    { key:"earning",         label:"Earnings",   count:txns.filter((t:any)=>t.type==="earning").length },
    { key:"deposit",         label:"Deposits",   count:txns.filter((t:any)=>t.type==="deposit").length },
    { key:"withdrawal",      label:"Withdrawals",count:txns.filter((t:any)=>t.type==="withdrawal").length },
  ];

  return (
    <div style={{ maxWidth:700, margin:"0 auto", paddingBottom:80 }}>
      <style>{`
        @keyframes shimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        .no-sb::-webkit-scrollbar{display:none} .no-sb{scrollbar-width:none}
        .tx-row:hover { background:#fafbff; }
        .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .coin-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .filter-scroll { position:relative; }
        .filter-scroll::after {
          content:""; position:absolute; right:0; top:0; bottom:2px; width:24px;
          background:linear-gradient(90deg,transparent,#f0f4fb); pointer-events:none;
        }
        @media(max-width:600px){
          .stat-grid { grid-template-columns:repeat(2,1fr)!important }
          .coin-grid { grid-template-columns:1fr!important }
          .tx-row    { padding:12px 14px!important; gap:10px!important }
        }
        @media(max-width:420px){
          .tx-amount { font-size:14px!important }
          .tx-icon   { width:38px!important; height:38px!important }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap" as const, gap:12, marginBottom:20 }}>
        <div>
          <h1 style={{ fontWeight:900, fontSize:24, letterSpacing:"-1px", margin:"0 0 4px", color:NAVY }}>Transactions</h1>
          <p style={{ fontSize:13, color:G.muted, margin:0 }}>
            {loading ? "Loading…" : `${txns.length} transaction${txns.length!==1?"s":""} · all time`}
          </p>
        </div>
        {txns.length > 0 && (
          <button type="button" onClick={exportCSV}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:`1px solid ${G.border}`, background:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, color:G.muted, transition:"all .2s" }}
            onMouseEnter={e=>{(e.currentTarget as any).style.borderColor=BLUE;(e.currentTarget as any).style.color=BLUE;}}
            onMouseLeave={e=>{(e.currentTarget as any).style.borderColor=G.border;(e.currentTarget as any).style.color=G.muted;}}>
            <Ico d={["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4","M7 10l5 5 5-5","M12 15V3"]} s={13}/>
            Export CSV
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ marginBottom:16 }}>
        {[
          { l:"Money In",    v:totalIn,   c:G.green, icon:"M12 5v14M5 12l7-7 7 7",  bg:G.greenBg, prefix:"+" },
          { l:"Money Out",   v:totalOut,  c:G.red,   icon:"M12 19V5M5 12l7 7 7-7",  bg:G.redBg,   prefix:"-" },
          { l:"Net Flow",    v:netFlow,   c:netFlow>=0?G.green:G.red, icon:"M23 6l-9.5 9.5-5-5L1 18", bg:netFlow>=0?G.greenBg:G.redBg, prefix:netFlow>=0?"+":"" },
          { l:"Total Earned",v:earnings,  c:GOLD,    icon:["M12 1v22","M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"], bg:"rgba(201,168,76,.1)", prefix:"+" },
        ].map(s => (
          <div key={s.l} style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:14, padding:"14px" }}>
            <div style={{ width:32, height:32, borderRadius:9, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}>
              <Ico d={s.icon} s={15} c={s.c}/>
            </div>
            {loading
              ? <><Sk h={20} w="70%" r={5}/><div style={{height:5}}/><Sk h={10} w="60%" r={4}/></>
              : <>
                  <div style={{ fontWeight:900, fontSize:17, color:s.c, fontFamily:"monospace", letterSpacing:"-.5px", marginBottom:3 }}>
                    {s.prefix}${Math.abs(s.v).toFixed(2)}
                  </div>
                  <div style={{ fontSize:11, color:G.muted, fontWeight:500 }}>{s.l}</div>
                </>
            }
          </div>
        ))}
      </div>

      {/* ── Coin breakdown ── */}
      <div className="coin-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
        {(["BTC","ETH","USDT"] as const).map(c => {
          const cfg   = COIN[c];
          const items = txns.filter((t:any) => t.coin === c);
          const total = items.reduce((a:number,t:any) => a+(t.usdValue??0), 0);
          return (
            <div key={c} style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:14, padding:"13px 14px", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:16, fontWeight:900, color:cfg.color, fontFamily:"monospace" }}>
                {cfg.sym}
              </div>
              <div style={{ minWidth:0 }}>
                {loading
                  ? <><Sk h={14} w={50} r={4}/><div style={{height:4}}/><Sk h={9} w={40} r={3}/></>
                  : <>
                      <div style={{ fontWeight:800, fontSize:14, color:NAVY, fontFamily:"monospace" }}>${total.toFixed(0)}</div>
                      <div style={{ fontSize:10, color:G.faint }}>{c} · {items.length} tx</div>
                    </>
                }
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Search + filters ── */}
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" as const }}>
        <div style={{ position:"relative", flex:"1 1 200px", minWidth:180 }}>
          <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
            <Ico d={["M11 19a8 8 0 100-16 8 8 0 000 16z","M21 21l-4.35-4.35"]} s={14} c={G.faint}/>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by description, hash, or coin…"
            style={{ width:"100%", padding:"9px 13px 9px 36px", border:`1.5px solid ${G.border}`, borderRadius:10, fontSize:13, outline:"none", background:"#fff", color:NAVY, boxSizing:"border-box" as const, transition:"border .15s" }}
            onFocus={e => (e.target.style.borderColor=BLUE)}
            onBlur={e  => (e.target.style.borderColor=G.border)}/>
        </div>
      </div>

      <div className="no-sb filter-scroll" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:14, paddingBottom:2 }}>
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 13px", borderRadius:99, flexShrink:0, cursor:"pointer", fontSize:12, fontWeight:filter===f.key?700:500, whiteSpace:"nowrap" as const, transition:"all .15s", border:`1.5px solid ${filter===f.key?NAVY:G.border}`, background:filter===f.key?NAVY:"#fff", color:filter===f.key?"#fff":G.muted }}>
            {f.label}
            {f.count > 0 && (
              <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, fontFamily:"monospace", fontWeight:600, background:filter===f.key?"rgba(255,255,255,.15)":"rgba(15,23,42,.06)", color:filter===f.key?"#fff":G.muted }}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Transaction list ── */}
      {loading ? (
        <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, padding:"4px 18px" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 0", borderBottom:i<3?`1px solid ${G.surface}`:"none" }}>
              <Sk w={42} h={42} r={11}/>
              <div style={{ flex:1 }}><Sk h={13} w="40%" r={4}/><div style={{height:6}}/><Sk h={10} w="60%" r={4}/></div>
              <div style={{ textAlign:"right" as const }}><Sk h={16} w={70} r={4}/><div style={{height:6}}/><Sk h={16} w={60} r={9}/></div>
            </div>
          ))}
        </div>
      ) : txns.length === 0 ? (
        <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, padding:"48px 24px", textAlign:"center" as const }}>
          <div style={{ width:56, height:56, borderRadius:16, background:G.surface, border:`1px solid ${G.border}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
            <Ico d="M18 20V10M12 20V4M6 20v-6" s={24} c="#c4c4c4"/>
          </div>
          <div style={{ fontWeight:700, fontSize:15, color:G.muted, marginBottom:5 }}>No transactions yet</div>
          <div style={{ fontSize:12, color:G.faint, lineHeight:1.65 }}>
            Your deposits, order payments, and earnings will appear here
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, padding:"40px 24px", textAlign:"center" as const }}>
          <div style={{ fontWeight:700, fontSize:14, color:G.muted, marginBottom:5 }}>No matching transactions</div>
          <div style={{ fontSize:12, color:G.faint, marginBottom:14 }}>Try a different filter or search term</div>
          <button type="button" onClick={() => { setFilter("all"); setSearch(""); }}
            style={{ padding:"8px 18px", borderRadius:9, border:`1.5px solid ${G.border}`, background:"transparent", color:G.muted, fontWeight:600, fontSize:12, cursor:"pointer" }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{ display:"grid", gap:14 }}>
          {grouped.map(group => (
            <div key={group.label}>
              {/* Group header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, padding:"0 4px" }}>
                <span style={{ fontSize:11, fontWeight:700, color:G.faint, textTransform:"uppercase" as const, letterSpacing:"1px" }}>
                  {group.label}
                </span>
                <span style={{ fontSize:11, color:G.faint }}>{group.items.length} transaction{group.items.length!==1?"s":""}</span>
              </div>

              {/* Group items */}
              <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, overflow:"hidden" }}>
                {group.items.map((tx:any, i:number) => {
                  const type = TX_TYPES[tx.type] ?? { label:tx.type?.replace(/_/g," ") ?? "Transaction", icon:"M5 12h14M12 5l7 7-7 7", color:G.muted, bg:G.surface, isIn:false };
                  const coin = COIN[tx.coin] ?? { color:G.muted, bg:G.surface, sym:"?" };
                  const date = tx.createdAt?.toDate?.();
                  return (
                    <div key={tx.id ?? i} className="tx-row"
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:i<group.items.length-1?`1px solid ${G.surface}`:"none", transition:"background .12s" }}>

                      {/* Type icon */}
                      <div className="tx-icon" style={{ width:42, height:42, borderRadius:12, flexShrink:0, background:type.bg, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                        <Ico d={type.icon} s={17} c={type.color} w={2}/>
                        {/* Coin badge */}
                        <div style={{ position:"absolute", bottom:-3, right:-3, width:18, height:18, borderRadius:"50%", background:coin.bg, border:"2px solid #fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:900, color:coin.color, fontFamily:"monospace" }}>
                          {coin.sym}
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:NAVY, marginBottom:3 }}>{type.label}</div>
                        {tx.description && (
                          <div style={{ fontSize:11, color:G.muted, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                            {tx.description}
                          </div>
                        )}
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                          <span style={{ fontSize:10, color:G.faint }}>
                            {group.label==="Today" ? fmtTime(date) : fmtDateTime(date)}
                          </span>
                          {tx.network && <span style={{ fontSize:10, color:G.faint }}>· {tx.network}</span>}
                          {tx.txHash && !tx.txHash.startsWith("adj_") && !tx.txHash.startsWith("order_") && !tx.txHash.startsWith("reimb_") && (
                            <button type="button" onClick={() => copyHash(tx.txHash)}
                              style={{ display:"flex", alignItems:"center", gap:3, fontSize:9, fontFamily:"monospace", color:BLUE, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                              {tx.txHash.slice(0,10)}…
                              <Ico d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2M8 4v4h8V4M8 4h8" s={9} c={BLUE}/>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                        <div className="tx-amount" style={{ fontFamily:"monospace", fontWeight:800, fontSize:15, color:type.isIn?G.green:G.red, marginBottom:3 }}>
                          {type.isIn?"+":"−"}${(tx.usdValue ?? 0).toFixed(2)}
                        </div>
                        <div style={{ fontSize:10, color:G.faint, fontFamily:"monospace", marginBottom:4 }}>
                          {tx.amount} {tx.coin}
                        </div>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:99, textTransform:"uppercase" as const, letterSpacing:".3px",
                          color:  tx.status==="confirmed" ? G.green   : tx.status==="pending" ? G.amber   : G.red,
                          background: tx.status==="confirmed" ? G.greenBg : tx.status==="pending" ? G.amberBg : G.redBg }}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer note ── */}
      {!loading && txns.length > 0 && (
        <p style={{ fontSize:11, color:G.faint, textAlign:"center" as const, marginTop:16, lineHeight:1.7 }}>
          Showing last 100 transactions · Export CSV for full history
        </p>
      )}
    </div>
  );
}
