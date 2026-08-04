// app/merchant/layout.tsx
"use client";
import { useEffect, useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, getDocs, collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useMerchantChatRoom, useMerchantStore, useNotifications, useWallet } from "@/lib/hooks";

// ── Context ───────────────────────────────────────────────────
interface Ctx { uid:string; name:string; email:string; storeId:string; storeName:string; }
export const MerchantCtx = createContext<Ctx|null>(null);
export const useMerchant = () => useContext(MerchantCtx)!;

const BLUE      = "#2563eb";
const BLUE_DARK = "#1d4ed8";
const NAVY      = "#0f172a";

const LANGS = [
  {code:"en",label:"English", flag:"🇬🇧"},
  {code:"ar",label:"العربية", flag:"🇸🇦"},
  {code:"fr",label:"Français",flag:"🇫🇷"},
  {code:"es",label:"Español", flag:"🇪🇸"},
  {code:"zh",label:"中文",     flag:"🇨🇳"},
];

const NAV = [
  {href:"/merchant/dashboard",    label:"Dashboard",    icon:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10", sub:"Overview"},
  {href:"/merchant/products",     label:"Products",     icon:["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"], sub:"Catalog & store"},
  {href:"/merchant/orders",       label:"Orders",       icon:["M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z","M3 6h18","M16 10a4 4 0 01-8 0"], sub:"Manage orders"},
  {href:"/merchant/wallet",       label:"Wallet",       icon:["M21 12V7H5a2 2 0 010-4h14v4","M3 5v14a2 2 0 002 2h16v-5","M18 12a2 2 0 000 4h4v-4z"], sub:"Funds & deposits"},
  {href:"/merchant/transactions", label:"Transactions", icon:"M18 20V10M12 20V4M6 20v-6", sub:"History"},
  {href:"/merchant/stores",       label:"Merchants",    icon:["M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z","M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9","M12 3v6"], sub:"Other stores"},
  {href:"/merchant/chat",         label:"Support",      icon:"M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z", sub:"Live chat", chat:true},
  {href:"/merchant/settings",     label:"Settings",     icon:["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"], sub:"Account"},
];

// Pages a blocked merchant can still access:
// dashboard — shows the blocked banner + is the redirect target
// wallet    — so they can still deposit funds to resolve the issue
// chat      — so they can contact support
const ALLOWED_BLOCKED = ["/merchant/dashboard","/merchant/wallet","/merchant/chat"];

const NOTIF_ICON_PATHS: Record<string,string> = {
  kyc:     "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  order:   "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0",
  deposit: "M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a2 2 0 000 4h4v-4z",
  earning: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  block:   "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4",
  reminder:"M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
};

const NOTIF_CFG: Record<string,{color:string;bg:string}> = {
  kyc:     {color:"#7c3aed", bg:"rgba(124,58,237,.1)"},
  order:   {color:BLUE,      bg:"rgba(37,99,235,.1)"},
  deposit: {color:"#16a34a", bg:"rgba(22,163,74,.1)"},
  earning: {color:"#16a34a", bg:"rgba(22,163,74,.1)"},
  block:   {color:"#dc2626", bg:"rgba(220,38,38,.1)"},
  reminder:{color:"#d97706", bg:"rgba(217,119,6,.1)"},
};

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function ChatDot({ uid }: { uid: string }) {
  const { room } = useMerchantChatRoom(uid);
  const n = room?.unreadMerchant ?? 0;
  if (!n) return null;
  return (
    <span style={{position:"absolute",top:-3,right:-3,minWidth:16,height:16,borderRadius:99,background:"#ef4444",color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

interface IconProps { size?: number; style?: React.CSSProperties; }
function SvgIcon({ d, size=16, style }: { d: string|string[] } & IconProps) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={style}>
      {paths.map((p,i) => <path key={i} d={p}/>)}
    </svg>
  );
}

const Bell     = (p: IconProps) => <SvgIcon {...p} d={["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9","M13.73 21a2 2 0 01-3.46 0"]}/>;
const Menu     = (p: IconProps) => <SvgIcon {...p} d="M3 12h18M3 6h18M3 18h18"/>;
const Sun      = (p: IconProps) => <SvgIcon {...p} d={["M12 2v2","M12 20v2","M4.22 4.22l1.42 1.42","M18.36 18.36l1.42 1.42","M2 12h2","M20 12h2","M4.22 19.78l1.42-1.42","M18.36 5.64l1.42-1.42","M12 8a4 4 0 100 8 4 4 0 000-8z"]}/>;
const Moon     = (p: IconProps) => <SvgIcon {...p} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>;
const LogOut   = (p: IconProps) => <SvgIcon {...p} d={["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"]}/>;
const X        = (p: IconProps) => <SvgIcon {...p} d="M18 6L6 18M6 6l12 12"/>;
const ChevDown = (p: IconProps) => <SvgIcon {...p} d="M6 9l6 6 6-6"/>;
const Clock    = (p: IconProps) => <SvgIcon {...p} d={["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 6v6l4 2"]}/>;

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [ctx,        setCtx]        = useState<Ctx|null>(null);
  const [checking,   setChecking]   = useState(true);
  const [sideOpen,   setSideOpen]   = useState(false);
  const [dark, setDarkRaw] = useState(false);
  const [lang, setLangRaw] = useState("en");

  // Persist dark + lang to localStorage
  function setDark(v: boolean | ((p:boolean)=>boolean)) {
    const next = typeof v === "function" ? v(dark) : v;
    setDarkRaw(next);
    try { localStorage.setItem("fs_dark", next?"1":"0"); } catch {}
  }
  function setLang(v: string) {
    setLangRaw(v);
    try { localStorage.setItem("fs_lang", v); } catch {}
  }
  const [showLang,   setShowLang]   = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifFilter,setNotifFilter]= useState<"all"|"unread"|"orders"|"wallet"|"system">("all");
  const [activeNotif,setActiveNotif]= useState<any>(null);

  const { store }                         = useMerchantStore(ctx?.uid ?? null);
  const { wallet }                        = useWallet(ctx?.uid ?? null) as any;
  const { notifs=[], unread=0, markRead, markAllRead } = useNotifications(ctx?.uid ?? null);
  const isBlocked = store?.status === "blocked";

  // Broadcasts
  const [broadcasts,   setBroadcasts]   = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("fs_dismissed_broadcasts");
      if (saved) setDismissedIds(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!ctx?.uid) return;
    const unsub = onSnapshot(
      query(collection(db,"system_messages"), where("active","==",true)),
      (snap: any) => setBroadcasts(snap.docs.map((d:any) => ({id:d.id,...d.data()}))),
      (e: any) => console.warn("broadcast error:", e)
    );
    return () => unsub();
  }, [ctx?.uid]);

  function dismissBroadcast(id: string) {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    try { sessionStorage.setItem("fs_dismissed_broadcasts", JSON.stringify(next)); } catch {}
  }

  const visibleBroadcasts = broadcasts.filter(b => !dismissedIds.includes(b.id));

  const T = dark ? {
    bg:"#0f1117", surface:"#1a1d27", border:"rgba(255,255,255,.08)",
    text:"#e2e8f0", muted:"#8892aa", card:"#1e2235",
  } : {
    bg:"#f0f4fb", surface:"#fff", border:"#e2e8f0",
    text:"#111827", muted:"#64748b", card:"#fff",
  };

  // Load persisted preferences
  useEffect(() => {
    try {
      const d = localStorage.getItem("fs_dark");
      const l = localStorage.getItem("fs_lang");
      if (d !== null) setDarkRaw(d === "1");
      if (l) setLangRaw(l);
    } catch {}
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      if (!u) { router.replace("/login"); return; }
      const snap = await getDoc(doc(db,"users",u.uid));
      if (!snap.exists() || snap.data().role !== "merchant") {
        await signOut(auth); router.replace("/login"); return;
      }
      const sq = await getDocs(query(collection(db,"stores"), where("merchantId","==",u.uid), limit(1)));
      const s = sq.empty ? null : { id: sq.docs[0].id, ...sq.docs[0].data() } as any;
      setCtx({ uid:u.uid, name:snap.data().displayName, email:u.email??"", storeId:s?.id??"", storeName:s?.storeName??"My Store" });
      setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    if (!isBlocked || !ctx) return;
    if (!ALLOWED_BLOCKED.some(p => pathname.startsWith(p))) router.replace("/merchant/dashboard");
  }, [isBlocked, pathname, ctx]);

  if (checking) return (
    <div style={{minHeight:"100vh",background:"#f0f4fb",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid rgba(37,99,235,.2)`,borderTopColor:BLUE,animation:"spin 1s linear infinite"}}/>
    </div>
  );

  const isAct = (h: string) => pathname === h || pathname.startsWith(h + "/");
  const canGo = (h: string) => !isBlocked || ALLOWED_BLOCKED.some(a => h.startsWith(a));
  const curLang = LANGS.find(l => l.code === lang) ?? LANGS[0];
  const isChat  = pathname === "/merchant/chat";

  // Notification helpers
  const now = new Date(); const tod = new Date(now); tod.setHours(0,0,0,0);
  const yes = new Date(tod); yes.setDate(yes.getDate()-1);

  const isNew = (n: any) => {
    const d = n.createdAt?.toDate?.();
    return d && (Date.now() - d.getTime()) < 300000;
  };

  const filteredNotifs = notifs.filter((n: any) => {
    if (notifFilter === "unread")  return !n.read;
    if (notifFilter === "orders")  return ["order","reminder"].includes(n.type);
    if (notifFilter === "wallet")  return ["deposit","earning"].includes(n.type);
    if (notifFilter === "system")  return ["kyc","block"].includes(n.type);
    return true;
  });

  const nGroups = [
    { l:"Today",     items: filteredNotifs.filter((n:any) => { const d = n.createdAt?.toDate?.(); return d && d >= tod; }) },
    { l:"Yesterday", items: filteredNotifs.filter((n:any) => { const d = n.createdAt?.toDate?.(); return d && d >= yes && d < tod; }) },
    { l:"Earlier",   items: filteredNotifs.filter((n:any) => { const d = n.createdAt?.toDate?.(); return !d || d < yes; }) },
  ].filter(g => g.items.length > 0);

  // Notification filter tabs
  const NTABS = [
    { key:"all",    label:`All (${notifs.length})` },
    { key:"unread", label:`Unread${unread > 0 ? ` (${unread})` : ""}` },
    { key:"orders", label:"Orders" },
    { key:"wallet", label:"Wallet" },
    { key:"system", label:"System" },
  ] as const;

  // ── Sidebar JSX builder ───────────────────────────────────────
  const buildSidebar = (mobile: boolean) => (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:NAVY,overflow:"hidden"}}>

      {/* Logo */}
      <div style={{padding:"16px 14px 12px",borderBottom:"1px solid rgba(255,255,255,.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${BLUE_DARK},${BLUE})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 4px 14px rgba(37,99,235,.45)`}}>
            <img src="/logo-icon.png" alt="" style={{width:22,height:22,objectFit:"contain",filter:"brightness(10)"}}
              onError={e => { (e.currentTarget as any).style.display="none"; }}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#fff",letterSpacing:"-.2px"}}>TargetGlobal</div>
            <div style={{fontSize:9,color:"rgba(37,99,235,.8)",fontWeight:600,letterSpacing:"2px"}}>MERCHANT</div>
          </div>
          {mobile && (
            <button type="button" onClick={() => setSideOpen(false)}
              style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,.06)",border:"none",cursor:"pointer",color:"rgba(255,255,255,.5)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <X size={15}/>
            </button>
          )}
        </div>
      </div>

      {/* Store status card */}
      <div style={{padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,.05)",flexShrink:0}}>
        <div style={{background:isBlocked?"rgba(220,38,38,.1)":"rgba(37,99,235,.1)",borderRadius:10,padding:"9px 11px",border:`1px solid ${isBlocked?"rgba(220,38,38,.18)":"rgba(37,99,235,.2)"}`}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:30,height:30,borderRadius:8,flexShrink:0,overflow:"hidden",background:isBlocked?"rgba(220,38,38,.2)":"rgba(37,99,235,.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {store?.logoUrl
                ? <img src={store.logoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : <span style={{fontSize:12,fontWeight:700,color:isBlocked?"#f87171":BLUE}}>{ctx?.storeName.slice(0,2).toUpperCase()}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ctx?.storeName}</div>
              <div style={{fontSize:9,fontWeight:600,letterSpacing:".5px",marginTop:2,color:isBlocked?"#f87171":store?.status==="active"?"#4ade80":"rgba(255,255,255,.3)"}}>
                {isBlocked ? "● BLOCKED" : store?.status==="active" ? "● ACTIVE" : "● PENDING"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:"8px 10px",overflowY:"auto"}}>
        <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.18)",letterSpacing:"2px",padding:"10px 8px 4px",textTransform:"uppercase" as const}}>Main</div>
        {NAV.slice(0,5).map(n => {
          const act = isAct(n.href);
          const ok  = canGo(n.href);
          if (!ok) return (
            <div key={n.href} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:9,marginBottom:1,opacity:.3,cursor:"not-allowed"}}>
              <SvgIcon d={n.icon as any} size={15} style={{color:"rgba(255,255,255,.3)"}}/>
              <span style={{flex:1,fontSize:12,color:"rgba(255,255,255,.5)"}}>{n.label}</span>
              <span style={{fontSize:9,color:"rgba(255,255,255,.3)",fontWeight:700,background:"rgba(220,38,38,.15)",borderRadius:4,padding:"1px 5px"}}>LOCKED</span>
            </div>
          );
          return (
            <Link key={n.href} href={n.href} onClick={() => mobile && setSideOpen(false)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:9,marginBottom:1,textDecoration:"none",transition:"all .15s",background:act?"rgba(37,99,235,.15)":"transparent",borderLeft:`3px solid ${act?BLUE:"transparent"}`}}
              onMouseEnter={e => { if (!act) (e.currentTarget as any).style.background="rgba(255,255,255,.05)"; }}
              onMouseLeave={e => { if (!act) (e.currentTarget as any).style.background="transparent"; }}>
              <SvgIcon d={n.icon as any} size={15} style={{color:act?"#fff":"rgba(255,255,255,.55)"}}/>
              <span style={{flex:1,fontSize:12,fontWeight:act?600:400,color:act?"#fff":"rgba(255,255,255,.55)"}}>{n.label}</span>
              {n.chat && ctx && <div style={{position:"relative"}}><ChatDot uid={ctx.uid}/></div>}
            </Link>
          );
        })}

        <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.18)",letterSpacing:"2px",padding:"14px 8px 4px",textTransform:"uppercase" as const}}>Account</div>
        {NAV.slice(5).map(n => {
          const act = isAct(n.href);
          const ok  = canGo(n.href);
          if (!ok) return (
            <div key={n.href} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:9,marginBottom:1,opacity:.3,cursor:"not-allowed"}}>
              <SvgIcon d={n.icon as any} size={15} style={{color:"rgba(255,255,255,.3)"}}/>
              <span style={{flex:1,fontSize:12,color:"rgba(255,255,255,.5)"}}>{n.label}</span>
              <span style={{fontSize:9,color:"rgba(255,255,255,.3)",fontWeight:700,background:"rgba(220,38,38,.15)",borderRadius:4,padding:"1px 5px"}}>LOCKED</span>
            </div>
          );
          return (
            <Link key={n.href} href={n.href} onClick={() => mobile && setSideOpen(false)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:9,marginBottom:1,textDecoration:"none",transition:"all .15s",background:act?"rgba(37,99,235,.15)":"transparent",borderLeft:`3px solid ${act?BLUE:"transparent"}`}}
              onMouseEnter={e => { if (!act) (e.currentTarget as any).style.background="rgba(255,255,255,.05)"; }}
              onMouseLeave={e => { if (!act) (e.currentTarget as any).style.background="transparent"; }}>
              <SvgIcon d={n.icon as any} size={15} style={{color:act?"#fff":"rgba(255,255,255,.55)"}}/>
              <span style={{flex:1,fontSize:12,fontWeight:act?600:400,color:act?"#fff":"rgba(255,255,255,.55)"}}>{n.label}</span>
              {n.chat && ctx && <div style={{position:"relative"}}><ChatDot uid={ctx.uid}/></div>}
            </Link>
          );
        })}
      </nav>

      {/* User row */}
      <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,background:"rgba(255,255,255,.04)"}}>
          <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${BLUE_DARK},${BLUE})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,flexShrink:0}}>
            {ctx?.name.slice(0,2).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ctx?.name}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ctx?.email}</div>
          </div>
          <button type="button" onClick={async () => { await signOut(auth); router.replace("/login"); }}
            style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",cursor:"pointer",color:"rgba(255,255,255,.4)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <LogOut size={13}/>
          </button>
        </div>
      </div>
    </div>
  );

  // ── Notification list (shared between desktop + mobile) ───────
  const notifList = (
    <div style={{overflowY:"auto",maxHeight:400}}>
      {filteredNotifs.length === 0 ? (
        <div style={{padding:"36px 20px",textAlign:"center"}}>
          <div style={{width:44,height:44,borderRadius:12,background:T.bg,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            <Bell size={20} style={{color:T.muted}}/>
          </div>
          <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:4}}>
            {notifFilter === "unread" ? "All caught up" : "No notifications"}
          </div>
          <div style={{fontSize:11,color:T.muted}}>
            {notifFilter === "unread" ? "No unread notifications." : "Activity will appear here."}
          </div>
        </div>
      ) : nGroups.map(g => (
        <div key={g.l}>
          <div style={{padding:"7px 14px 4px",display:"flex",justifyContent:"space-between",background:dark?"rgba(255,255,255,.02)":T.bg}}>
            <span style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:"1.5px"}}>{g.l}</span>
            <span style={{fontSize:9,color:T.muted}}>{g.items.length}</span>
          </div>
          {g.items.map((n: any) => {
            const cfg = NOTIF_CFG[n.type] ?? {color:"#64748b",bg:"rgba(100,116,139,.08)"};
            const isUnread = !n.read;
            const fresh = isNew(n);
            return (
              <div key={n.id}
                onClick={() => { setShowNotifs(false); setActiveNotif(n); if (isUnread) markRead(n.id); }}
                style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 14px",borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:isUnread ? (dark?"rgba(37,99,235,.07)":"rgba(37,99,235,.03)") : "transparent"}}>
                <div style={{width:34,height:34,borderRadius:9,background:cfg.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:cfg.color,position:"relative"}}>
                  <SvgIcon d={NOTIF_ICON_PATHS[n.type] ?? "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0"} size={15}/>
                  {isUnread && <div style={{position:"absolute",bottom:-2,right:-2,width:8,height:8,borderRadius:"50%",background:cfg.color,border:`1.5px solid ${T.surface}`}}/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:6,marginBottom:2}}>
                    <div style={{fontSize:12,fontWeight:isUnread?700:500,color:isUnread?T.text:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{n.title}</div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                      {fresh && <span style={{fontSize:8,fontWeight:700,background:BLUE,color:"#fff",padding:"1px 5px",borderRadius:4}}>NEW</span>}
                      <span style={{fontSize:9,color:T.muted}}>{n.createdAt?.toDate?.() ? timeAgo(n.createdAt.toDate()) : "now"}</span>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:T.muted,lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{n.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  // ── Filter tabs (shared) ──────────────────────────────────────
  const filterTabs = (
    <div style={{display:"flex",gap:0,overflowX:"auto"}}>
      {NTABS.map(f => (
        <button key={f.key} type="button" onClick={() => setNotifFilter(f.key)}
          style={{padding:"7px 12px",border:"none",cursor:"pointer",fontSize:11,fontWeight:notifFilter===f.key?700:500,color:notifFilter===f.key?BLUE:T.muted,background:"transparent",borderBottom:notifFilter===f.key?`2px solid ${BLUE}`:"2px solid transparent",whiteSpace:"nowrap" as const,transition:"all .15s",flexShrink:0}}>
          {f.label}
        </button>
      ))}
    </div>
  );

  const MerchantProvider = MerchantCtx.Provider;

  return (
    <MerchantProvider value={ctx}>
    <div style={{display:"flex",minHeight:"100vh",background:T.bg,transition:"background .2s"}}>

      {/* Desktop sidebar */}
      <aside style={{width:228,flexShrink:0,height:"100vh",position:"sticky",top:0,overflowY:"auto",display:"none"}} id="sd">
        {buildSidebar(false)}
      </aside>

      {/* Mobile drawer */}
      {sideOpen && <>
        <div onClick={() => setSideOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:40,backdropFilter:"blur(2px)"}}/>
        <aside style={{position:"fixed",left:0,top:0,bottom:0,width:248,zIndex:50,overflowY:"auto",animation:"slideRight .25s ease"}}>
          {buildSidebar(true)}
        </aside>
      </>}

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

        {/* ── Topbar ── */}
        <header style={{height:56,background:T.surface,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:12,justifyContent:"space-between",position:"sticky",top:0,zIndex:30,flexShrink:0,boxShadow:dark?"none":"0 1px 3px rgba(0,0,0,.06)"}}>

          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button type="button" onClick={() => setSideOpen(true)} className="merchant-hamburger"
              style={{width:44,height:44,borderRadius:8,background:"transparent",border:`1px solid ${T.border}`,cursor:"pointer",color:T.muted,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Menu size={17}/>
            </button>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:T.text,lineHeight:1.2}}>
                {NAV.find(n => isAct(n.href))?.label ?? "Dashboard"}
              </div>
              <div style={{fontSize:10,color:T.muted}}>
                {NAV.find(n => isAct(n.href))?.sub ?? "Overview"}
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:6}}>

            {/* Language */}
            <div style={{position:"relative"}}>
              <button type="button" onClick={() => { setShowLang(v => !v); setShowNotifs(false); }}
                style={{display:"flex",alignItems:"center",gap:5,height:44,padding:"0 10px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",color:T.muted,fontSize:12}}>
                <span style={{fontSize:15}}>{curLang.flag}</span>
                <span className="lng-label" style={{fontSize:11,fontWeight:600}}>{curLang.label}</span>
                <ChevDown size={10}/>
              </button>
              {showLang && (
                <div style={{position:"absolute",right:0,top:48,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.15)",zIndex:60,overflow:"hidden",minWidth:160,animation:"slideDown .2s"}}>
                  {LANGS.map(l => (
                    <div key={l.code} onClick={() => { setLang(l.code); setShowLang(false); }}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",fontSize:13,fontWeight:lang===l.code?700:400,background:lang===l.code?(dark?"rgba(37,99,235,.12)":T.bg):"transparent",color:lang===l.code?BLUE:T.text}}>
                      <span style={{fontSize:18}}>{l.flag}</span>
                      <span>{l.label}</span>
                      {lang === l.code && <span style={{marginLeft:"auto",color:BLUE,fontSize:12}}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Theme */}
            <button type="button" onClick={() => setDark(v => !v)}
              style={{width:44,height:44,borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",color:T.muted,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {dark ? <Sun size={15}/> : <Moon size={15}/>}
            </button>

            {/* Wallet mini — desktop only */}
            {ctx && (
              <a href="/merchant/wallet" className="lng-label"
                style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:9,background:dark?"rgba(201,168,76,.1)":"rgba(15,23,42,.05)",border:`1px solid ${dark?"rgba(201,168,76,.2)":"rgba(15,23,42,.08)"}`,textDecoration:"none",transition:"all .2s"}}
                onMouseEnter={e=>{(e.currentTarget as any).style.borderColor="#c9a84c";}}
                onMouseLeave={e=>{(e.currentTarget as any).style.borderColor=dark?"rgba(201,168,76,.2)":"rgba(15,23,42,.08)";}}>
                <span style={{fontSize:9,fontWeight:700,color:"#c9a84c"}}>💰</span>
                <span style={{fontSize:12,fontWeight:700,color:dark?"#c9a84c":T.text,fontFamily:"monospace"}}>
                  ${(wallet?.usdEquivalent??0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
              </a>
            )}

            {/* Bell */}
            <div style={{position:"relative",zIndex:10}}>
              <button type="button"
                onClick={() => { setShowNotifs(v => !v); setShowLang(false); }}
                style={{width:44,height:44,borderRadius:8,border:`1px solid ${showNotifs?BLUE:T.border}`,background:showNotifs?"rgba(37,99,235,.1)":"transparent",cursor:"pointer",color:showNotifs?BLUE:T.muted,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",transition:"all .15s"}}>
                <Bell size={15}/>
                {unread > 0 && (
                  <span aria-hidden style={{position:"absolute",top:-4,right:-4,minWidth:18,height:18,borderRadius:99,background:"#dc2626",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",border:`2px solid ${T.surface}`,animation:"badgePulse 2s ease infinite"}}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            </div>

            {/* Avatar */}
            <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${BLUE_DARK},${BLUE})`,color:"#fff",fontWeight:800,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 2px 8px rgba(37,99,235,.35)`}}>
              {ctx?.name.slice(0,2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* ── BROADCAST MODAL ── */}
        {visibleBroadcasts.length > 0 && (() => {
          const b = visibleBroadcasts[0];
          type BT = {icon:string;accent:string;iconBg:string;label:string;ctaLabel:string;ctaHref:string};
          const S: Record<string,BT> = {
            info:   {icon:"📢",accent:"#2563eb",iconBg:"rgba(37,99,235,.08)",label:"Announcement",   ctaLabel:"Browse Catalog →",    ctaHref:"/merchant/products?tab=catalog"},
            warning:{icon:"⚠️",accent:"#d97706",iconBg:"rgba(245,158,11,.08)",label:"Notice",         ctaLabel:"View Orders →",        ctaHref:"/merchant/orders"},
            urgent: {icon:"🚨",accent:"#dc2626",iconBg:"rgba(239,68,68,.08)", label:"Urgent",         ctaLabel:"Contact Support →",    ctaHref:"/merchant/chat"},
            success:{icon:"🎉",accent:"#16a34a",iconBg:"rgba(22,163,74,.08)", label:"Great News",     ctaLabel:"Browse New Products →",ctaHref:"/merchant/products?tab=catalog"},
          };
          const s: BT = S[b.type as string] ?? S.info;
          return (
            <>
              <div aria-hidden style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.65)",backdropFilter:"blur(8px)"}}/>
              <div role="dialog" aria-modal="true" style={{position:"fixed",top:"50%",left:"50%",zIndex:401,transform:"translate(-50%,-50%)",width:"min(460px,94vw)",background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 25px 60px rgba(0,0,0,.25)",animation:"broadcastPop .3s cubic-bezier(.34,1.2,.64,1)"}}>
                <div style={{height:4,background:s.accent}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px 0"}}>
                  <span style={{fontSize:10,fontWeight:700,color:s.accent,letterSpacing:"1.8px",textTransform:"uppercase" as const}}>{s.label}</span>
                  <button type="button" onClick={() => dismissBroadcast(b.id)} style={{width:30,height:30,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#f9fafb",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",fontSize:16}}>×</button>
                </div>
                <div style={{padding:"20px 24px 0",textAlign:"center"}}>
                  <div style={{width:72,height:72,margin:"0 auto 16px",background:s.iconBg,borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>{s.icon}</div>
                  <h2 style={{fontWeight:800,fontSize:20,color:NAVY,lineHeight:1.2,margin:"0 0 10px"}}>{b.title}</h2>
                  <p style={{fontSize:14,color:"#64748b",lineHeight:1.8,margin:"0 0 20px"}}>{b.message}</p>
                </div>
                <div style={{height:1,background:"#f1f5f9",margin:"0 20px"}}/>
                <div style={{padding:"16px 20px",display:"grid",gap:9}}>
                  <a href={s.ctaHref} onClick={() => dismissBroadcast(b.id)} style={{display:"block",padding:"13px",borderRadius:12,background:NAVY,color:"#c9a84c",fontWeight:700,fontSize:14,textDecoration:"none",textAlign:"center"}}>{s.ctaLabel}</a>
                  <button type="button" onClick={() => dismissBroadcast(b.id)} style={{padding:"10px",borderRadius:12,border:"1.5px solid #e5e7eb",background:"transparent",color:"#64748b",fontWeight:500,fontSize:13,cursor:"pointer"}}>Dismiss</button>
                </div>
              </div>
            </>
          );
        })()}

        {/* Page content */}
        {isChat
          ? <div style={{flex:1,overflow:"hidden"}}>{children}</div>
          : <main style={{flex:1,overflowY:"auto",padding:"18px 16px 96px",maxWidth:960,width:"100%",margin:"0 auto"}}>{children}</main>
        }

        {/* Mobile bottom nav */}
        <nav style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,borderTop:`1px solid ${T.border}`,display:"flex",zIndex:20,paddingBottom:"env(safe-area-inset-bottom,0px)"}} id="bn">
          {NAV.slice(0,5).map(n => {
            const act = isAct(n.href);
            const ok  = canGo(n.href);
            if (!ok) return (
              <div key={n.href} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1,padding:"8px 4px 5px",opacity:.25,cursor:"not-allowed"}}>
                <SvgIcon d={n.icon as any} size={18}/>
                <span style={{fontSize:8,color:T.muted}}>Locked</span>
              </div>
            );
            return (
              <Link key={n.href} href={n.href}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"7px 4px 5px",textDecoration:"none",WebkitTapHighlightColor:"transparent",position:"relative",color:act?NAVY:T.muted}}>
                {act && <div style={{position:"absolute",top:0,left:"25%",right:"25%",height:2,background:NAVY,borderRadius:"0 0 4px 4px"}}/>}
                <SvgIcon d={n.icon as any} size={18}/>
                <span style={{fontSize:8,fontWeight:act?700:400,color:act?NAVY:T.muted}}>
                  {n.label==="Transactions"?"Txns":n.label==="Merchants"?"Stores":n.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Desktop notification dropdown (position:fixed, root level) ── */}
      {showNotifs && (
        <div className="nd-wrap">
          <div onClick={() => setShowNotifs(false)} style={{position:"fixed",inset:0,zIndex:198}}/>
          <div style={{position:"fixed",right:16,top:64,width:380,background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,boxShadow:"0 16px 48px rgba(0,0,0,.18)",zIndex:199,overflow:"hidden",animation:"slideDown .18s ease"}}>
            <div style={{padding:"14px 16px 0",borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:700,fontSize:15,color:T.text}}>Notifications</span>
                  {unread > 0 && <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:99,background:"rgba(220,38,38,.1)",color:"#dc2626"}}>{unread} unread</span>}
                </div>
                {unread > 0 && (
                  <button type="button" onClick={() => markAllRead && markAllRead()} style={{fontSize:12,fontWeight:500,color:BLUE,border:"none",background:"transparent",cursor:"pointer"}}>Mark all read</button>
                )}
              </div>
              {filterTabs}
            </div>
            {notifList}
            <div style={{padding:"10px 14px",borderTop:`1px solid ${T.border}`,textAlign:"center",background:dark?"rgba(255,255,255,.02)":T.bg}}>
              <button type="button" onClick={() => setShowNotifs(false)} style={{fontSize:12,color:BLUE,border:"none",background:"transparent",cursor:"pointer",fontWeight:500}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile notification sheet ── */}
      {showNotifs && (
        <div className="nm">
          <div onClick={() => setShowNotifs(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:80,backdropFilter:"blur(3px)"}}/>
          <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,borderRadius:"20px 20px 0 0",zIndex:81,maxHeight:"90dvh",display:"flex",flexDirection:"column",animation:"slideUp .28s cubic-bezier(.34,1.1,.64,1)",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
            <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}>
              <div style={{width:36,height:4,borderRadius:99,background:T.border}}/>
            </div>
            <div style={{padding:"0 16px 0",borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingTop:4}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:700,fontSize:17,color:T.text}}>Notifications</span>
                  {unread > 0 && <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:99,background:"rgba(220,38,38,.1)",color:"#dc2626"}}>{unread} unread</span>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {unread > 0 && <button type="button" onClick={() => markAllRead && markAllRead()} style={{fontSize:12,color:BLUE,border:"none",background:"transparent",cursor:"pointer",fontWeight:500}}>Mark all read</button>}
                  <button type="button" onClick={() => setShowNotifs(false)} style={{width:30,height:30,borderRadius:8,border:`1px solid ${T.border}`,background:T.bg,cursor:"pointer",color:T.muted,display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
                </div>
              </div>
              {filterTabs}
            </div>
            <div style={{flex:1,overflowY:"auto"}}>{notifList}</div>
            <div style={{padding:"10px 16px",borderTop:`1px solid ${T.border}`,textAlign:"center"}}>
              <button type="button" onClick={() => setShowNotifs(false)} style={{fontSize:13,color:BLUE,border:"none",background:"transparent",cursor:"pointer",fontWeight:500}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification popup ── */}
      {activeNotif && (() => {
        const n = activeNotif;
        const cfg = NOTIF_CFG[n.type] ?? {color:"#64748b",bg:"rgba(100,116,139,.1)"};
        const actions: Record<string,{l:string;h:string}> = {
          order:   {l:"View Orders",  h:"/merchant/orders"},
          deposit: {l:"View Wallet",  h:"/merchant/wallet"},
          earning: {l:"View Wallet",  h:"/merchant/wallet"},
          kyc:     {l:"Dashboard",    h:"/merchant/dashboard"},
          block:   {l:"Get Support",  h:"/merchant/chat"},
          reminder:{l:"View Orders",  h:"/merchant/orders"},
        };
        const act = actions[n.type];
        const ts  = n.createdAt?.toDate?.();
        return (
          <>
            <div onClick={() => setActiveNotif(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:200,backdropFilter:"blur(4px)"}}/>
            <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(440px,92vw)",background:T.surface,borderRadius:24,boxShadow:"0 40px 80px rgba(0,0,0,.35)",zIndex:201,overflow:"hidden",animation:"popIn .25s cubic-bezier(.34,1.56,.64,1)"}}>
              <div style={{height:4,background:cfg.color}}/>
              <div style={{padding:"22px 24px 18px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                  <div style={{width:48,height:48,borderRadius:14,background:cfg.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:cfg.color}}>
                    <SvgIcon d={NOTIF_ICON_PATHS[n.type] ?? "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0"} size={20}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase" as const,color:cfg.color,marginBottom:4}}>{n.type?.toUpperCase() ?? "NOTIFICATION"}</div>
                    <div style={{fontWeight:800,fontSize:16,color:T.text,lineHeight:1.3}}>{n.title}</div>
                    {ts && (
                      <div style={{fontSize:11,color:T.muted,marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                        <Clock size={11} style={{color:T.muted}}/>
                        {ts.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} · {ts.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setActiveNotif(null)} style={{width:30,height:30,borderRadius:8,background:T.bg,border:`1px solid ${T.border}`,cursor:"pointer",color:T.muted,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <X size={14}/>
                  </button>
                </div>
              </div>
              <div style={{padding:"18px 24px 24px"}}>
                <p style={{fontSize:14,color:T.muted,lineHeight:1.85,marginBottom:n.orderId?16:20}}>{n.body}</p>

                {/* Order details — shown when notification has order metadata */}
                {n.orderId&&(
                  <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
                    {/* Order ID + timestamp */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:"1px"}}>
                        Order #{n.orderShortId??n.orderId.slice(-8).toUpperCase()}
                      </span>
                      {n.createdAt?.toDate?.()&&(
                        <span style={{fontSize:10,color:T.muted}}>
                          {n.createdAt.toDate().toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                        </span>
                      )}
                    </div>

                    {/* Order details rows */}
                    {[
                      n.storeName       && ["Store",         n.storeName],
                      n.customerName    && ["Customer",      n.customerName],
                      n.customerCity    && ["Location",      n.customerCity],
                      n.firstItem&&n.itemCount>1 && ["Items", `${n.firstItem} +${n.itemCount-1} more`],
                      n.firstItem&&n.itemCount===1 && ["Item", n.firstItem],
                      n.status          && ["Status",        n.status.charAt(0).toUpperCase()+n.status.slice(1)],
                      n.trackingNumber  && ["Tracking",      n.trackingNumber],
                      n.orderTotal>0    && ["Order Value",   `$${Number(n.orderTotal).toFixed(2)}`],
                      n.estimatedProfit>0&&["Your Profit",   `+$${Number(n.estimatedProfit).toFixed(2)}`],
                    ].filter(Boolean).map((row:any,i:number)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:12,color:T.muted}}>{row[0]}</span>
                        <span style={{fontSize:12,fontWeight:700,color:row[0]==="Your Profit"?BLUE_DARK:T.text,fontFamily:row[0]==="Order Value"||row[0]==="Your Profit"?"monospace":"inherit"}}>
                          {row[1]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{display:"flex",gap:10}}>
                  {act && (
                    <Link href={act.h} onClick={() => setActiveNotif(null)}
                      style={{flex:1,padding:"13px",borderRadius:12,background:`linear-gradient(135deg,${BLUE_DARK},${BLUE})`,color:"#fff",fontWeight:700,fontSize:14,textDecoration:"none",textAlign:"center",boxShadow:"0 4px 16px rgba(37,99,235,.3)"}}>
                      {act.l} →
                    </Link>
                  )}
                  <button type="button" onClick={() => setActiveNotif(null)} style={{padding:"13px 20px",borderRadius:12,border:`1.5px solid ${T.border}`,background:"transparent",color:T.muted,fontWeight:600,fontSize:14,cursor:"pointer",flex:act?undefined:1}}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

    
      <style>{`
        @media(min-width:768px){
          #sd{display:block!important}
          .nd-wrap{display:block!important}
          .nm{display:none!important}
          #bn{display:none!important}
          main{padding-bottom:40px!important}
          .lng-label{display:inline!important}
          .merchant-hamburger{display:none!important}
        }
        @media(max-width:767px){
          .nd-wrap{display:none!important}
          .merchant-hamburger{display:flex!important}
          .lng-label{display:none!important}
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes badgePulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4)}70%{box-shadow:0 0 0 8px rgba(220,38,38,0)}}
        @keyframes slideRight{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @keyframes broadcastPop{from{opacity:0;transform:translate(-50%,-46%) scale(.93)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:translate(-50%,-46%) scale(.94)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        *{box-sizing:border-box} html{-webkit-text-size-adjust:100%}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(37,99,235,.2);border-radius:99px}
      `}</style>
    </div>
    </MerchantProvider>
  );
}
