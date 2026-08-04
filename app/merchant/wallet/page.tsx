// app/merchant/wallet/page.tsx
"use client";
import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useMerchant } from "../layout";
import { useWallet, useWithdrawals, requestWithdrawal } from "@/lib/hooks";
import { storage } from "@/lib/firebase/client";
import toast from "react-hot-toast";

// ── Tokens ────────────────────────────────────────────────────
const NAVY = "#0f172a";
const BLUE = "#2563eb";
const GOLD = "#c9a84c";
const G = {
  green: "#16a34a", greenBg: "rgba(22,163,74,.08)",   greenBd: "rgba(22,163,74,.2)",
  amber: "#d97706", amberBg: "rgba(217,119,6,.08)",   amberBd: "rgba(217,119,6,.2)",
  red:   "#dc2626", redBg:   "rgba(220,38,38,.07)",   redBd:   "rgba(220,38,38,.2)",
  blue:  BLUE,      blueBg:  "rgba(37,99,235,.08)",   blueBd:  "rgba(37,99,235,.2)",
  border: "#e5e7eb", surface: "#f8fafc",
  text:   "#111827", muted:   "#6b7280", faint: "#9ca3af",
};

// ── Coin config ────────────────────────────────────────────────
const COINS: Record<string,{ label:string; symbol:string; color:string; bg:string; icon:string }> = {
  BTC:  { label:"Bitcoin",   symbol:"₿", color:"#f7931a", bg:"rgba(247,147,26,.1)", icon:"B" },
  ETH:  { label:"Ethereum",  symbol:"Ξ", color:"#627eea", bg:"rgba(98,126,234,.1)", icon:"E" },
  USDT: { label:"Tether",    symbol:"₮", color:"#26a17b", bg:"rgba(38,161,123,.1)", icon:"₮" },
};

// ── Platform deposit addresses (from Vercel env vars) ────────
// Single platform addresses — all merchants deposit to these.
// Receipts are uploaded to prove which merchant sent the funds.
const PLATFORM_ADDRESSES: Record<string, string> = {
  BTC:       process.env.NEXT_PUBLIC_BTC_ADDRESS    ?? "",
  ETH:       process.env.NEXT_PUBLIC_ETH_ADDRESS    ?? "",
  USDT_TRC20:process.env.NEXT_PUBLIC_USDT_TRC20     ?? "",
  USDT_ERC20:process.env.NEXT_PUBLIC_USDT_ERC20     ?? "",
};

function getDepositAddress(coin: string, network: string): string {
  if (coin === "BTC")  return PLATFORM_ADDRESSES.BTC;
  if (coin === "ETH")  return PLATFORM_ADDRESSES.ETH;
  if (coin === "USDT" && network === "TRC20") return PLATFORM_ADDRESSES.USDT_TRC20;
  if (coin === "USDT" && network === "ERC20") return PLATFORM_ADDRESSES.USDT_ERC20;
  return "";
}

// ── SVG icon ──────────────────────────────────────────────────
function Ico({ d, s=16, c="currentColor", w=1.75 }: { d:string|string[]; s?:number; c?:string; w?:number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(Array.isArray(d)?d:[d]).map((p,i) => <path key={i} d={p}/>)}
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function Sk({ w="100%", h=14, r=6 }: { w?:string|number; h?:number; r?:number }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }}/>;
}

// ── Copy button ───────────────────────────────────────────────
function CopyBtn({ text }: { text:string }) {
  const [ok, setOk] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(text);
    setOk(true);
    toast.success("Copied!");
    setTimeout(() => setOk(false), 2000);
  }
  return (
    <button type="button" onClick={copy}
      style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:`1px solid ${ok?G.greenBd:G.border}`, background:ok?G.greenBg:"#fff", color:ok?G.green:G.muted, fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0, transition:"all .2s" }}>
      <Ico d={ok?"M20 6L9 17l-5-5":"M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2M8 4v4h8V4M8 4h8"} s={12}/>
      {ok ? "Copied" : "Copy"}
    </button>
  );
}

// ── Status badge ──────────────────────────────────────────────
function WdBadge({ s }: { s:string }) {
  const m: Record<string,{c:string;bg:string}> = {
    pending:   { c:G.amber, bg:G.amberBg },
    approved:  { c:G.green, bg:G.greenBg },
    rejected:  { c:G.red,   bg:G.redBg   },
    completed: { c:GOLD,    bg:"rgba(201,168,76,.1)" },
  };
  const st = m[s] ?? { c:G.muted, bg:G.surface };
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:99, textTransform:"uppercase" as const, color:st.c, background:st.bg, letterSpacing:".3px" }}>
      {s}
    </span>
  );
}

// ── QR code ───────────────────────────────────────────────────
function QRCode({ value }: { value:string }) {
  if (!value || value === "Contact support to get your address.") {
    return (
      <div style={{ textAlign:"center" as const, padding:"20px 0" }}>
        <div style={{ width:40, height:40, borderRadius:10, background:G.amberBg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
          <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" s={18} c={G.amber}/>
        </div>
        <div style={{ fontSize:12, color:G.muted, lineHeight:1.65 }}>Address not set up yet.<br/>Contact support to get your deposit address.</div>
      </div>
    );
  }
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(value)}&color=0f172a&bgcolor=ffffff&margin=8`}
      alt="Wallet QR Code" width={160} height={160}
      style={{ borderRadius:12, border:`1px solid ${G.border}`, display:"block" }}/>
  );
}

// ── Receipt upload ────────────────────────────────────────────
function ReceiptUpload({ preview, progress, onFile, onClear }: {
  preview:string|null; progress:number|null;
  onFile:(f:File)=>void; onClear:()=>void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handle(file: File) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Please upload an image or PDF."); return;
    }
    if (file.size > 10*1024*1024) { toast.error("File must be under 10MB."); return; }
    onFile(file);
  }

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:600, color:G.muted, marginBottom:8 }}>
        Payment Receipt <span style={{ color:G.red }}>*</span>
        <span style={{ fontSize:10, color:G.faint, marginLeft:6, fontWeight:400 }}>Screenshot or PDF of your transfer</span>
      </div>

      {preview ? (
        <div style={{ borderRadius:12, overflow:"hidden", border:`1.5px solid ${G.greenBd}`, background:G.greenBg }}>
          <img src={preview} alt="Receipt" style={{ width:"100%", maxHeight:160, objectFit:"cover", display:"block" }}/>
          <div style={{ padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Ico d="M20 6L9 17l-5-5" s={13} c={G.green}/>
              <span style={{ fontSize:12, color:G.green, fontWeight:700 }}>Receipt uploaded</span>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={() => inputRef.current?.click()} style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${G.border}`, background:"#fff", color:G.muted, fontSize:11, fontWeight:600, cursor:"pointer" }}>Change</button>
              <button type="button" onClick={onClear} style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${G.redBd}`, background:"transparent", color:G.red, fontSize:11, fontWeight:600, cursor:"pointer" }}>Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
          style={{ border:`2px dashed ${drag?BLUE:G.border}`, borderRadius:12, padding:"22px 16px", textAlign:"center" as const, cursor:"pointer", background:drag?G.blueBg:G.surface, transition:"all .2s" }}>
          {progress !== null ? (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:BLUE, marginBottom:8 }}>Uploading… {progress}%</div>
              <div style={{ height:5, background:G.border, borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${progress}%`, background:BLUE, borderRadius:99, transition:"width .2s" }}/>
              </div>
            </div>
          ) : (
            <>
              <div style={{ width:44, height:44, borderRadius:12, background:G.blueBg, border:`1px solid ${G.blueBd}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                <Ico d={["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4","M17 8l-5-5-5 5","M12 3v12"]} s={20} c={BLUE}/>
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:G.text, marginBottom:3 }}>Drop receipt here or click to upload</div>
              <div style={{ fontSize:11, color:G.faint }}>JPG, PNG or PDF · Max 10MB</div>
            </>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display:"none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }}/>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function WalletPage() {
  const ctx    = useMerchant();
  const params = useSearchParams();

  const [tab,    setTab]    = useState<"overview"|"deposit"|"withdraw"|"history">(
    (params.get("tab") as any) ?? "overview"
  );
  const [coin,   setCoin]   = useState("USDT");
  const [net,    setNet]    = useState("TRC20");
  const [wdAmt,  setWdAmt]  = useState("");
  const [wdAddr, setWdAddr] = useState("");
  const [sub,    setSub]    = useState(false);

  // Deposit state
  const [depAmount,      setDepAmount]      = useState("");
  const [submittingDep,  setSubmittingDep]  = useState(false);
  const [receiptFile,    setReceiptFile]    = useState<File|null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string|null>(null);
  const [receiptProgress,setReceiptProgress]= useState<number|null>(null);

  const { wallet }     = useWallet(ctx.uid);
  const { wds   = [] } = useWithdrawals(ctx.uid);

  const bal = wallet?.balances ?? { BTC:0, ETH:0, USDT_TRC20:0, USDT_ERC20:0 };
  const totalUSD = wallet?.usdEquivalent ?? 0;

  const coinCards = [
    { k:"BTC",  l:"Bitcoin",  b:bal.BTC,                        u:bal.BTC*66500   },
    { k:"ETH",  l:"Ethereum", b:bal.ETH,                        u:bal.ETH*3000    },
    { k:"USDT", l:"Tether",   b:(bal.USDT_TRC20+bal.USDT_ERC20), u:bal.USDT_TRC20+bal.USDT_ERC20 },
  ];

  const depAddr = getDepositAddress(coin, net) || "Contact support to get your address.";

  const selBal = coin==="BTC" ? bal.BTC : coin==="ETH" ? bal.ETH : net==="TRC20" ? bal.USDT_TRC20 : bal.USDT_ERC20;

  function handleReceiptFile(file: File) {
    setReceiptFile(file);
    const r = new FileReader();
    r.onload = e => setReceiptPreview(e.target?.result as string);
    r.readAsDataURL(file);
  }

  async function handleDeposit() {
    const amt = parseFloat(depAmount);
    if (!depAmount || isNaN(amt) || amt <= 0) { toast.error("Enter the amount you sent."); return; }
    if (!receiptFile) { toast.error("Please upload your payment receipt."); return; }
    if (depAddr === "Contact support to get your address.") { toast.error("No deposit address available. Contact support."); return; }

    setSubmittingDep(true);
    try {
      setReceiptProgress(0);
      const path       = `deposit-receipts/${ctx.uid}/${Date.now()}_receipt`;
      const storageRef = ref(storage, path);
      const task       = uploadBytesResumable(storageRef, receiptFile);

      const receiptUrl = await new Promise<string>((resolve, reject) => {
        task.on("state_changed",
          s   => setReceiptProgress(Math.round((s.bytesTransferred/s.totalBytes)*100)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref))
        );
      });
      setReceiptProgress(null);

      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase/client");
      await addDoc(collection(db,"deposit_requests"), {
        merchantId:    ctx.uid,
        storeId:       ctx.storeId,
        merchantName:  ctx.storeName,
        coin,
        network:       coin==="USDT" ? net : coin==="BTC" ? "Bitcoin" : "Ethereum",
        amount:        amt,
        depositAddress:depAddr,
        receiptUrl,
        status:        "pending",
        requestedAt:   serverTimestamp(),
      });

      toast.success("Deposit request submitted! Admin will verify and credit your wallet.");
      setDepAmount(""); setReceiptFile(null); setReceiptPreview(null);
    } catch (err) {
      toast.error("Failed to submit. Please try again.");
      console.error(err);
    }
    setSubmittingDep(false);
  }

  async function handleWd(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(wdAmt);
    if (!wdAddr.trim())              { toast.error("Enter destination address."); return; }
    if (isNaN(amt) || amt <= 0)      { toast.error("Enter valid amount."); return; }
    if (amt > selBal)                { toast.error("Insufficient balance."); return; }
    setSub(true);
    try {
      await requestWithdrawal({
        merchantId:          ctx.uid,
        storeId:             ctx.storeId,
        merchantName:        ctx.storeName,
        coin,
        network:             coin==="USDT" ? net : coin==="BTC" ? "Bitcoin" : "Ethereum",
        amount:              amt,
        usdValue:            coin==="BTC" ? amt*66500 : coin==="ETH" ? amt*3000 : amt,
        destinationAddress:  wdAddr,
      });
      toast.success("Withdrawal submitted! Admin reviews within 24 hours.");
      setWdAmt(""); setWdAddr(""); setTab("history");
    } catch { toast.error("Failed to submit withdrawal."); }
    setSub(false);
  }

  // ── Shared field styles ──
  const inp: React.CSSProperties = {
    width:"100%", padding:"11px 14px", border:`1.5px solid ${G.border}`,
    borderRadius:11, fontSize:13, outline:"none", color:G.text,
    boxSizing:"border-box" as const, background:"#fff", transition:"border .15s",
  };

  const TABS = [
    { key:"overview",  label:"Overview",  icon:"M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
    { key:"deposit",   label:"Deposit",   icon:"M12 5v14M5 12l7-7 7 7"                                   },
    { key:"withdraw",  label:"Withdraw",  icon:"M12 19V5M5 12l7 7 7-7"                                   },
    { key:"history",   label:"History",   icon:"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"            },
  ] as const;

  return (
    <div style={{ maxWidth:620, margin:"0 auto", paddingBottom:80 }}>
      <style>{`
        @keyframes shimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        .coin-sel:hover { border-color: var(--cc) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontWeight:900, fontSize:24, letterSpacing:"-1px", margin:"0 0 4px", color:NAVY }}>Wallet</h1>
        <p style={{ fontSize:13, color:G.muted, margin:0 }}>Manage your crypto balances</p>
      </div>

      {/* ── Hero balance card ── */}
      <div style={{ background:`linear-gradient(135deg,${NAVY} 0%,#1e3a6e 100%)`, borderRadius:20, padding:"24px 22px", marginBottom:14, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-30, top:-30, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,.03)", pointerEvents:"none" }}/>
        <div style={{ position:"absolute", right:30, bottom:-40, width:150, height:150, borderRadius:"50%", background:"rgba(201,168,76,.05)", pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <p style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,.4)", margin:"0 0 6px", textTransform:"uppercase" as const, letterSpacing:"1.5px" }}>
            Portfolio Value
          </p>
          <p style={{ fontWeight:900, fontSize:34, color:GOLD, letterSpacing:"-1.5px", margin:"0 0 4px", lineHeight:1, fontFamily:"monospace" }}>
            ${totalUSD.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
          </p>
          <p style={{ fontSize:12, color:"rgba(255,255,255,.35)", margin:"0 0 20px" }}>BTC · ETH · USDT</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {(["deposit","withdraw"] as const).map((t,i) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                style={{ padding:"11px", borderRadius:11, border:"1.5px solid rgba(255,255,255,.2)", background:tab===t?"rgba(255,255,255,.15)":"rgba(255,255,255,.07)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all .2s" }}>
                <Ico d={i===0?"M12 5v14M5 12l7-7 7 7":"M12 19V5M5 12l7 7 7-7"} s={14} c="#fff"/>
                {i===0?"Deposit":"Withdraw"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Coin balance cards ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
        {coinCards.map(c => {
          const cfg = COINS[c.k];
          return (
            <div key={c.k} style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:14, padding:"14px 12px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:900, color:cfg.color, flexShrink:0 }}>
                  {cfg.symbol}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:11, color:NAVY }}>{c.k}</div>
                  <div style={{ fontSize:9, color:G.faint }}>{cfg.label}</div>
                </div>
              </div>
              <div style={{ fontWeight:900, fontSize:16, color:cfg.color, fontFamily:"monospace", marginBottom:2 }}>
                {c.b.toFixed(c.k==="BTC"?5:2)}
              </div>
              <div style={{ fontSize:10, color:G.faint }}>≈ ${c.u.toLocaleString("en-US",{maximumFractionDigits:2})}</div>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:16, overflow:"hidden" }}>
        {/* Tab bar */}
        <div style={{ display:"flex", borderBottom:`1px solid ${G.border}` }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key as any)}
              style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"13px 6px", border:"none", background:tab===t.key?"rgba(37,99,235,.05)":"transparent", cursor:"pointer", fontSize:12, fontWeight:tab===t.key?700:500, color:tab===t.key?BLUE:G.muted, borderBottom:tab===t.key?`2px solid ${BLUE}`:"2px solid transparent", transition:"all .15s" }}>
              <Ico d={t.icon} s={13} c={tab===t.key?BLUE:G.muted}/>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding:"20px" }}>

          {/* ── OVERVIEW ── */}
          {tab==="overview" && (
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:14 }}>Balance Breakdown</div>
              <div style={{ border:`1px solid ${G.border}`, borderRadius:13, overflow:"hidden", marginBottom:16 }}>
                {[
                  { l:"Total (USD)",    v:`$${totalUSD.toFixed(2)}`,                  c:GOLD    },
                  { l:"Bitcoin (BTC)",  v:`₿ ${bal.BTC.toFixed(6)}`,                  c:COINS.BTC.color  },
                  { l:"Ethereum (ETH)", v:`Ξ ${bal.ETH.toFixed(4)}`,                  c:COINS.ETH.color  },
                  { l:"USDT TRC-20",   v:`₮ ${bal.USDT_TRC20.toFixed(2)}`,           c:COINS.USDT.color },
                  { l:"USDT ERC-20",   v:`₮ ${bal.USDT_ERC20.toFixed(2)}`,           c:COINS.USDT.color },
                ].map((r,i,arr) => (
                  <div key={r.l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderBottom:i<arr.length-1?`1px solid ${G.surface}`:"none", background:i===0?NAVY:"#fff" }}>
                    <span style={{ fontSize:13, color:i===0?"rgba(255,255,255,.5)":G.muted }}>{r.l}</span>
                    <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:700, color:i===0?GOLD:r.c }}>{r.v}</span>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <div style={{ background:G.blueBg, border:`1px solid ${G.blueBd}`, borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:BLUE, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                  <Ico d={["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 8h.01","M12 12v4"]} s={14} c={BLUE}/>
                  How your wallet works
                </div>
                {[
                  "Deposit crypto → admin verifies → balance credited",
                  "Submit order → retail cost deducted automatically",
                  "Order delivered → profit credited to your wallet",
                  "Withdraw anytime → admin processes within 24 hours",
                ].map((s,i) => (
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:i<3?6:0 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:BLUE, flexShrink:0, paddingTop:1 }}>{i+1}.</span>
                    <span style={{ fontSize:12, color:G.muted, lineHeight:1.6 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── DEPOSIT ── */}
          {tab==="deposit" && (
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:4 }}>Request a Deposit</div>
              <p style={{ fontSize:12, color:G.muted, margin:"0 0 18px", lineHeight:1.7 }}>
                Send crypto to the address below, then upload your receipt and submit. Admin will verify and credit your wallet.
              </p>

              {/* Coin selector */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:8 }}>Select Coin</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {["BTC","ETH","USDT"].map(c => {
                    const cfg = COINS[c];
                    const sel = coin===c;
                    return (
                      <button key={c} type="button" onClick={() => setCoin(c)}
                        style={{ padding:"12px 8px", borderRadius:12, cursor:"pointer", border:`2px solid ${sel?cfg.color:G.border}`, background:sel?cfg.bg:G.surface, display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all .2s" }}>
                        <div style={{ fontSize:22, fontWeight:900, color:cfg.color, fontFamily:"monospace" }}>{cfg.symbol}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:sel?cfg.color:G.muted }}>{c}</div>
                        <div style={{ fontSize:9, color:G.faint }}>{cfg.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Network (USDT only) */}
              {coin==="USDT" && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:8 }}>Network</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {["TRC20","ERC20"].map(n => {
                      const sel = net===n;
                      return (
                        <button key={n} type="button" onClick={() => setNet(n)}
                          style={{ padding:"11px", borderRadius:11, cursor:"pointer", border:`2px solid ${sel?COINS.USDT.color:G.border}`, background:sel?COINS.USDT.bg:G.surface, fontWeight:700, fontSize:12, color:sel?COINS.USDT.color:G.muted, transition:"all .2s" }}>
                          {n}
                          <div style={{ fontSize:9, fontWeight:400, color:G.faint, marginTop:2 }}>{n==="TRC20"?"Tron Network":"Ethereum Network"}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* QR + Address */}
              <div style={{ background:G.surface, borderRadius:14, padding:"18px", border:`1px solid ${G.border}`, marginBottom:16 }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                  <QRCode value={depAddr}/>
                  {depAddr !== "Contact support to get your address." && (
                    <>
                      <div style={{ fontSize:11, color:G.muted, textAlign:"center" as const }}>
                        Send <strong>{coin}{coin==="USDT"?` (${net})`:""}</strong> only to this address
                      </div>
                      <div style={{ width:"100%", display:"flex", alignItems:"center", gap:8, background:"#fff", border:`1px solid ${G.border}`, borderRadius:10, padding:"10px 12px" }}>
                        <span style={{ flex:1, fontFamily:"monospace", fontSize:10, color:G.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                          {depAddr}
                        </span>
                        <CopyBtn text={depAddr}/>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:8 }}>Amount You Sent</div>
                <input type="number" step="any" placeholder="0.00" value={depAmount}
                  onChange={e => setDepAmount(e.target.value)}
                  style={{ ...inp }}
                  onFocus={e => (e.target.style.borderColor=BLUE)}
                  onBlur={e  => (e.target.style.borderColor=G.border)}/>
              </div>

              {/* Receipt */}
              <ReceiptUpload
                preview={receiptPreview} progress={receiptProgress}
                onFile={handleReceiptFile}
                onClear={() => { setReceiptFile(null); setReceiptPreview(null); }}/>

              {/* Submit */}
              <button type="button" onClick={handleDeposit} disabled={submittingDep}
                style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:submittingDep?"rgba(37,99,235,.35)":`linear-gradient(135deg,${NAVY},#1e3a6e)`, color:GOLD, fontWeight:700, fontSize:14, cursor:submittingDep?"not-allowed":"pointer", marginBottom:12, transition:"all .2s" }}>
                {submittingDep ? "Uploading & Submitting…" : "Submit Deposit Request →"}
              </button>

              <div style={{ background:G.amberBg, border:`1px solid ${G.amberBd}`, borderRadius:11, padding:"11px 14px", fontSize:12, color:G.amber, lineHeight:1.65 }}>
                ⚠️ Only submit after you have already sent the payment. Admin verifies receipts before crediting your wallet.
              </div>
            </div>
          )}

          {/* ── WITHDRAW ── */}
          {tab==="withdraw" && (
            <form onSubmit={handleWd}>
              <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:4 }}>Withdraw Crypto</div>
              <p style={{ fontSize:12, color:G.muted, margin:"0 0 18px", lineHeight:1.7 }}>
                Withdrawals are reviewed by admin and processed within 24 hours.
              </p>

              {/* Coin */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:8 }}>Select Coin</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {["BTC","ETH","USDT"].map(c => {
                    const cfg = COINS[c]; const sel = coin===c;
                    return (
                      <button key={c} type="button" onClick={() => setCoin(c)}
                        style={{ padding:"12px 8px", borderRadius:12, cursor:"pointer", border:`2px solid ${sel?cfg.color:G.border}`, background:sel?cfg.bg:G.surface, display:"flex", flexDirection:"column", alignItems:"center", gap:3, transition:"all .2s" }}>
                        <div style={{ fontSize:20, color:cfg.color, fontFamily:"monospace", fontWeight:900 }}>{cfg.symbol}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:sel?cfg.color:G.muted }}>{c}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Network (USDT) */}
              {coin==="USDT" && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:8 }}>Network</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {["TRC20","ERC20"].map(n => (
                      <button key={n} type="button" onClick={() => setNet(n)}
                        style={{ padding:"10px", borderRadius:10, cursor:"pointer", border:`2px solid ${net===n?COINS.USDT.color:G.border}`, background:net===n?COINS.USDT.bg:G.surface, fontWeight:700, fontSize:12, color:net===n?COINS.USDT.color:G.muted, transition:"all .2s" }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Available balance */}
              <div style={{ background:NAVY, borderRadius:12, padding:"14px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,.45)" }}>Available to withdraw</span>
                <span style={{ fontFamily:"monospace", fontWeight:800, fontSize:18, color:GOLD }}>
                  {COINS[coin].symbol} {selBal.toFixed(coin==="BTC"?6:2)}
                </span>
              </div>

              {/* Address */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:G.muted, marginBottom:8 }}>Destination Address</div>
                <input value={wdAddr} onChange={e => setWdAddr(e.target.value)}
                  placeholder={`Your ${coin} wallet address`}
                  style={{ ...inp, fontFamily:"monospace" }}
                  onFocus={e => (e.target.style.borderColor=BLUE)}
                  onBlur={e  => (e.target.style.borderColor=G.border)}/>
              </div>

              {/* Amount */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:G.muted }}>Amount</div>
                  <button type="button" onClick={() => setWdAmt(String(Math.max(0,selBal-0.001).toFixed(coin==="BTC"?6:4)))}
                    style={{ fontSize:11, color:BLUE, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>
                    Use Max
                  </button>
                </div>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontFamily:"monospace", fontSize:16, color:G.faint }}>
                    {COINS[coin].symbol}
                  </span>
                  <input type="number" step="any" value={wdAmt}
                    onChange={e => setWdAmt(e.target.value)}
                    placeholder="0.00"
                    style={{ ...inp, paddingLeft:34, marginBottom:0 }}
                    onFocus={e => (e.target.style.borderColor=BLUE)}
                    onBlur={e  => (e.target.style.borderColor=parseFloat(wdAmt)>selBal?G.red:G.border)}/>
                </div>
                {parseFloat(wdAmt) > selBal && (
                  <div style={{ fontSize:11, color:G.red, marginTop:4 }}>Amount exceeds available balance</div>
                )}
              </div>

              <button type="submit" disabled={sub}
                style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:sub?`rgba(37,99,235,.35)`:`linear-gradient(135deg,${NAVY},#1e3a6e)`, color:GOLD, fontWeight:700, fontSize:14, cursor:sub?"not-allowed":"pointer", transition:"all .2s" }}>
                {sub ? "Submitting…" : "Submit Withdrawal →"}
              </button>
              <p style={{ fontSize:11, color:G.faint, textAlign:"center" as const, marginTop:8 }}>Processed within 24 hours · No minimum amount</p>
            </form>
          )}

          {/* ── HISTORY ── */}
          {tab==="history" && (
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:14 }}>Withdrawal History</div>
              {wds.length === 0 ? (
                <div style={{ textAlign:"center" as const, padding:"36px 0" }}>
                  <div style={{ width:52, height:52, borderRadius:14, background:G.surface, border:`1px solid ${G.border}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                    <Ico d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" s={22} c="#c4c4c4"/>
                  </div>
                  <div style={{ fontWeight:700, fontSize:14, color:G.muted, marginBottom:4 }}>No withdrawals yet</div>
                  <div style={{ fontSize:12, color:G.faint }}>Your withdrawal requests will appear here</div>
                </div>
              ) : wds.map((w:any, i:number) => {
                const cfg = COINS[w.coin] ?? COINS.USDT;
                const date = w.requestedAt?.toDate?.();
                return (
                  <div key={w.id ?? i} style={{ padding:"14px 0", borderBottom:i<wds.length-1?`1px solid ${G.surface}`:"none" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:11, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:17, color:cfg.color, fontFamily:"monospace", fontWeight:900 }}>
                        {cfg.symbol}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                          <div>
                            <span style={{ fontWeight:700, fontSize:13, color:NAVY }}>{w.amount} {w.coin}</span>
                            <span style={{ fontSize:10, color:G.faint, marginLeft:6 }}>{w.network}</span>
                          </div>
                          <span style={{ fontWeight:800, fontSize:14, color:G.green, fontFamily:"monospace" }}>${w.usdValue?.toFixed(2) ?? "—"}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:w.rejectionReason?8:0 }}>
                          <WdBadge s={w.status}/>
                          <span style={{ fontSize:10, color:G.faint }}>
                            {date?.toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}) ?? "—"}
                          </span>
                        </div>
                        {w.rejectionReason && (
                          <div style={{ padding:"7px 10px", background:G.redBg, borderRadius:8, fontSize:11, color:G.red, marginTop:6 }}>
                            Reason: {w.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
