// app/merchant/settings/page.tsx
// Design: navy #0f172a · blue #2563eb · no gold
"use client";
import { useState, useEffect, useRef } from "react";
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase/client";
import { useMerchant } from "../layout";
import { useMerchantStore, useMerchantKYC, useReferralCode } from "@/lib/hooks";
import toast from "react-hot-toast";

// ── Tokens ────────────────────────────────────────────────────
const NAVY = "#0f172a";
const BLUE = "#2563eb";
const C    = { green:"#16a34a", red:"#dc2626", amber:"#d97706", muted:"#64748b" };

const PLAN: Record<string,{label:string;price:string;comm:string;max:string;color:string;bg:string}> = {
  starter:{ label:"Starter", price:"Free",   comm:"3%",   max:"10 products",  color:"#6b7280", bg:"rgba(107,114,128,.15)" },
  growth: { label:"Growth",  price:"$19/mo", comm:"2.5%", max:"50 products",  color:"#60a5fa", bg:"rgba(96,165,250,.15)"  },
  pro:    { label:"Pro",     price:"$29/mo", comm:"2%",   max:"Unlimited",    color:"#a5b4fc", bg:"rgba(165,180,252,.15)" },
};

// ── SVG icons ─────────────────────────────────────────────────
const Ico = ({ d, s=16, c="currentColor" }:{ d:string|string[]; s?:number; c?:string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
  </svg>
);
const ICO = {
  user:     "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z",
  lock:     ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z","M7 11V7a5 5 0 0110 0v4"],
  bell:     ["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9","M13.73 21a2 2 0 01-3.46 0"],
  store:    ["M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z","M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9","M12 3v6"],
  shield:   ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z","M9 12l2 2 4-4"],
  plan:     ["M12 2L2 7l10 5 10-5-10-5z","M2 17l10 5 10-5","M2 12l10 5 10-5"],
  upload:   ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4","M17 8l-5-5-5 5","M12 3v12"],
  logout:   ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
  check:    "M20 6L9 17l-5-5",
  eye:      ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 9a3 3 0 100 6 3 3 0 000-6z"],
  eyeOff:   ["M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94","M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19","M1 1l22 22"],
};

// ── Shared primitives ─────────────────────────────────────────
const card:React.CSSProperties = {
  background:"#fff", border:"1px solid #e5e9f5",
  borderRadius:16, padding:20, marginBottom:12,
};
const inp = (focus=BLUE):React.CSSProperties => ({
  width:"100%", padding:"11px 13px",
  border:"1.5px solid #e5e9f5", borderRadius:10,
  fontSize:16, outline:"none", color:"#111827",
  background:"#fff", boxSizing:"border-box" as const,
  transition:"border .15s",
});
const lbl:React.CSSProperties = {
  display:"block", fontSize:10, fontWeight:700,
  color:"#64748b", marginBottom:5,
  textTransform:"uppercase" as const, letterSpacing:".6px",
};
const primaryBtn:React.CSSProperties = {
  padding:"10px 22px", borderRadius:10, border:"none",
  background:`linear-gradient(135deg,#1d4ed8,${BLUE})`,
  color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer",
  boxShadow:"0 4px 12px rgba(37,99,235,.25)",
  transition:"opacity .15s, transform .15s",
};
const ghostBtn:React.CSSProperties = {
  padding:"10px 18px", borderRadius:10,
  border:"1.5px solid #e5e7eb",
  background:"transparent", color:"#64748b",
  fontWeight:600, fontSize:13, cursor:"pointer",
};

// ── Section header ────────────────────────────────────────────
function SectionHead({ icon, title }:{ icon:string|string[]; title:string }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
      <div style={{width:32,height:32,borderRadius:9,background:"rgba(37,99,235,.08)",
        border:"1px solid rgba(37,99,235,.15)",display:"flex",alignItems:"center",
        justifyContent:"center",flexShrink:0}}>
        <Ico d={icon} s={15} c={BLUE}/>
      </div>
      <div style={{fontWeight:700,fontSize:15,color:NAVY}}>{title}</div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────
function Toggle({ label, desc, value, onChange }:{
  label:string; desc:string; value:boolean; onChange:(v:boolean)=>void;
}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",
      alignItems:"center",padding:"13px 0",
      borderBottom:"1px solid #f3f4f6"}}>
      <div style={{flex:1,paddingRight:16}}>
        <div style={{fontSize:13,fontWeight:600,color:NAVY}}>{label}</div>
        <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={()=>onChange(!value)}
        style={{width:44,height:25,borderRadius:99,cursor:"pointer",flexShrink:0,
          border:"none",padding:"0 3px",
          background:value?BLUE:"#d1d5db",
          display:"flex",alignItems:"center",
          justifyContent:value?"flex-end":"flex-start",
          transition:"background .2s",
          boxShadow:value?"0 0 0 3px rgba(37,99,235,.2)":"none"}}>
        <div style={{width:19,height:19,borderRadius:"50%",background:"#fff",
          boxShadow:"0 1px 4px rgba(0,0,0,.2)",transition:"all .2s"}}/>
      </button>
    </div>
  );
}

// ── Logo upload ───────────────────────────────────────────────
function LogoUpload({ storeId, currentLogo, onUploaded }:{
  storeId:string; currentLogo:string|null; onUploaded:(url:string)=>void;
}) {
  const [preview,  setPreview]  = useState<string|null>(currentLogo);
  const [progress, setProgress] = useState<number|null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ if(currentLogo) setPreview(currentLogo); },[currentLogo]);

  async function handleFile(file:File) {
    if(!file.type.startsWith("image/")){ toast.error("Please upload an image."); return; }
    if(file.size>5*1024*1024){ toast.error("Max 5MB."); return; }
    const reader=new FileReader();
    reader.onload=e=>setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    const path=`store-logos/${storeId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g,"_")}`;
    const task=uploadBytesResumable(ref(storage,path),file);
    task.on("state_changed",
      s=>setProgress(Math.round((s.bytesTransferred/s.totalBytes)*100)),
      e=>{ toast.error("Upload failed."); setProgress(null); },
      async()=>{
        const url=await getDownloadURL(task.snapshot.ref);
        await updateDoc(doc(db,"stores",storeId),{ logoUrl:url, updatedAt:serverTimestamp() });
        onUploaded(url); setProgress(null);
        toast.success("Logo updated!");
      }
    );
  }

  return (
    <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
      {/* Preview */}
      <div style={{width:80,height:80,borderRadius:16,flexShrink:0,overflow:"hidden",
        border:`2px solid ${preview?"rgba(37,99,235,.25)":"#e5e7eb"}`,
        background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {preview
          ?<img src={preview} alt="Store logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          :<Ico d={ICO.store} s={28} c="#94a3b8"/>}
      </div>

      {/* Upload zone */}
      <div style={{flex:1,minWidth:200}}>
        <div
          onClick={()=>inputRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
          style={{border:`2px dashed ${dragging?BLUE:"#e5e7eb"}`,borderRadius:12,
            padding:"16px",textAlign:"center",cursor:"pointer",
            background:dragging?"rgba(37,99,235,.04)":"#f8fafc",
            transition:"all .2s"}}>
          {progress!==null?(
            <div>
              <div style={{fontSize:12,fontWeight:600,color:BLUE,marginBottom:6}}>
                Uploading… {progress}%
              </div>
              <div style={{height:4,background:"#e5e7eb",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${progress}%`,
                  background:`linear-gradient(90deg,#1d4ed8,${BLUE})`,
                  borderRadius:99,transition:"width .2s"}}/>
              </div>
            </div>
          ):(
            <>
              <Ico d={ICO.upload} s={20} c="#94a3b8"/>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",margin:"6px 0 2px"}}>
                Click or drag to upload
              </div>
              <div style={{fontSize:11,color:"#9ca3af"}}>PNG, JPG up to 5MB</div>
            </>
          )}
        </div>
        {preview&&progress===null&&(
          <button onClick={()=>inputRef.current?.click()}
            style={{marginTop:8,padding:"6px 14px",borderRadius:8,
              border:`1.5px solid rgba(37,99,235,.25)`,
              background:"rgba(37,99,235,.05)",color:BLUE,
              fontSize:12,fontWeight:600,cursor:"pointer"}}>
            Change Logo
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value="";}}/>
    </div>
  );
}

// ── Password input with show/hide ─────────────────────────────
function PwInput({ value, onChange, placeholder }:{
  value:string; onChange:(v:string)=>void; placeholder:string;
}) {
  const [show,setShow]=useState(false);
  return (
    <div style={{position:"relative",marginBottom:12}}>
      <input
        type={show?"text":"password"}
        value={value}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{...inp(),width:"100%",paddingRight:44}}
        onFocus={e=>(e.target.style.borderColor=BLUE)}
        onBlur={e=>(e.target.style.borderColor="#e5e9f5")}
      />
      <button
        type="button"
        onClick={()=>setShow(v=>!v)}
        aria-label={show?"Hide password":"Show password"}
        style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
          background:"transparent",border:"none",cursor:"pointer",
          color:"#94a3b8",display:"flex",alignItems:"center",padding:4}}>
        <Ico d={show?ICO.eyeOff:ICO.eye} s={15}/>
      </button>
    </div>
  );
}

// ── Password strength ─────────────────────────────────────────
function PwStrength({ pw }:{ pw:string }) {
  if(!pw) return null;
  const checks = [
    { label:"8+ characters", ok:pw.length>=8 },
    { label:"Uppercase",     ok:/[A-Z]/.test(pw) },
    { label:"Number",        ok:/\d/.test(pw) },
    { label:"Symbol",        ok:/[^a-zA-Z0-9]/.test(pw) },
  ];
  const score = checks.filter(c=>c.ok).length;
  const color = score<=1?C.red:score<=2?C.amber:score<=3?BLUE:C.green;
  const label = score<=1?"Weak":score<=2?"Fair":score<=3?"Good":"Strong";
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",gap:4,marginBottom:5}}>
        {[1,2,3,4].map(i=>(
          <div key={i} style={{flex:1,height:3,borderRadius:99,
            background:i<=score?color:"#e5e7eb",transition:"background .2s"}}/>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {checks.map(c=>(
            <span key={c.label} style={{fontSize:10,color:c.ok?C.green:"#9ca3af",
              display:"flex",alignItems:"center",gap:3}}>
              <Ico d={ICO.check} s={10} c={c.ok?C.green:"#d1d5db"}/>
              {c.label}
            </span>
          ))}
        </div>
        <span style={{fontSize:10,fontWeight:700,color}}>{label}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function SettingsPage() {
  const ctx    = useMerchant();
  const router = useRouter();
  const { store } = useMerchantStore(ctx.uid);
  const { kyc }   = useMerchantKYC(ctx.uid);
  const { referralCode, referrals, loading: refLoading } = useReferralCode(ctx.uid);
  const [makingCode, setMakingCode] = useState(false);

  // ── Manually generate a referral code (for legacy accounts) ──
  async function createReferralCode() {
    if (makingCode || referralCode) return;
    setMakingCode(true);
    try {
      const { doc:fsDoc, updateDoc:fsUpdate, addDoc:fsAdd, collection:fsColl,
              query:fsQuery, where:fsWhere, limit:fsLimit, getDocs:fsGet,
              serverTimestamp:fsNow } = await import("firebase/firestore");
      const { db:fsDb } = await import("@/lib/firebase/client");

      const base  = (ctx.name ?? "FS").trim().split(" ")[0]
                      .toUpperCase().replace(/[^A-Z]/g,"").slice(0,4) || "FS";
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const make  = () => {
        let s = "";
        for (let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)];
        return `${base}-${s}`;
      };

      // Find a code that isn't taken
      let code = make();
      for (let i=0;i<6;i++) {
        const dup = await fsGet(
          fsQuery(fsColl(fsDb,"referral_codes"), fsWhere("code","==",code), fsLimit(1))
        );
        if (dup.empty) break;
        code = make();
      }

      await fsUpdate(fsDoc(fsDb,"users",ctx.uid), {
        referralCode: code,
        referralCodeCreatedAt: fsNow(),
      });
      await fsAdd(fsColl(fsDb,"referral_codes"), {
        code,
        merchantId:   ctx.uid,
        merchantName: ctx.name,
        createdAt:    fsNow(),
      });

      toast.success("Referral code created!");
    } catch (e:any) {
      console.error("[settings] referral generate failed:", e);
      toast.error("Couldn't generate a code. Please try again.");
    }
    setMakingCode(false);
  }


  const [name,    setName]    = useState(ctx.name);
  const [phone,   setPhone]   = useState("");
  const [bio,     setBio]     = useState("");
  const [savingP, setSavingP] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string|null>(null);

  const [oldPw,    setOldPw]    = useState("");
  const [newPw,    setNewPw]    = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [notifs, setNotifs] = useState({
    newOrder:true, withdrawal:true, deposit:true,
    kyc:true, weeklyReport:true, lowStock:false,
  });
  const [savingN, setSavingN] = useState(false);

  // Load user + store data
  useEffect(()=>{
    getDoc(doc(db,"users",ctx.uid)).then(s=>{
      if(s.exists()) setPhone(s.data().phone??"");
    });
  },[ctx.uid]);

  useEffect(()=>{
    if(!store) return;
    if(store.logoUrl)          setLogoUrl(store.logoUrl);
    if(store.bio)              setBio(store.bio);
    if(store.notificationPrefs) setNotifs(n=>({...n,...store.notificationPrefs}));
  },[store]);

  async function saveProfile(e:React.FormEvent) {
    e.preventDefault(); setSavingP(true);
    try {
      await Promise.all([
        updateDoc(doc(db,"users",ctx.uid),{ displayName:name, phone, updatedAt:serverTimestamp() }),
        ctx.storeId && updateDoc(doc(db,"stores",ctx.storeId),{ bio, updatedAt:serverTimestamp() }),
      ]);
      toast.success("Profile saved!");
    } catch { toast.error("Failed to save."); }
    setSavingP(false);
  }

  async function changePw(e:React.FormEvent) {
    e.preventDefault();
    if(newPw.length<8){ toast.error("Min 8 characters."); return; }
    setSavingPw(true);
    try {
      const u=auth.currentUser!;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email!,oldPw));
      await updatePassword(u,newPw);
      toast.success("Password updated!"); setOldPw(""); setNewPw("");
    } catch(err:any) {
      toast.error(err.code==="auth/invalid-credential"?"Wrong current password.":"Failed.");
    }
    setSavingPw(false);
  }

  async function saveNotifs() {
    setSavingN(true);
    try {
      if(ctx.storeId)
        await updateDoc(doc(db,"stores",ctx.storeId),{
          notificationPrefs:notifs, updatedAt:serverTimestamp(),
        });
      toast.success("Notification preferences saved!");
    } catch { toast.error("Failed."); }
    setSavingN(false);
  }

  const plan = store?.plan ?? "starter";
  const pi   = PLAN[plan] ?? PLAN.starter;

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{marginBottom:20}}>
        <h1 style={{fontWeight:900,fontSize:22,letterSpacing:"-.5px",color:NAVY,marginBottom:3}}>
          Settings
        </h1>
        <p style={{fontSize:13,color:"#64748b"}}>
          Manage your account, store and preferences
        </p>
      </div>

      {/* ── PLAN ── */}
      <div className="fu d1" style={{...card,background:NAVY,border:"none",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",flexWrap:"wrap",gap:14}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.35)",
              letterSpacing:"2px",marginBottom:8,textTransform:"uppercase"}}>
              Current Plan
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontWeight:800,fontSize:22,color:"#fff"}}>{pi.label}</span>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",
                borderRadius:99,color:pi.color,background:pi.bg}}>
                {pi.price}
              </span>
            </div>
            <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
              {[
                {l:"Commission", v:pi.comm},
                {l:"Products",   v:pi.max},
                {l:"Margin",     v:"20%"},
              ].map(s=>(
                <div key={s.l}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.35)",
                    textTransform:"uppercase",letterSpacing:"1px",marginBottom:2}}>
                    {s.l}
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          {plan!=="pro"&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:8}}>
                {plan==="starter"?"Upgrade for lower commission":"One step to unlimited"}
              </div>
              <button style={{
                padding:"9px 20px",borderRadius:10,border:"none",
                background:`linear-gradient(135deg,#1d4ed8,${BLUE})`,
                color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",
                boxShadow:"0 4px 14px rgba(37,99,235,.35)"}}>
                Upgrade Plan →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── STORE BRANDING ── */}
      <div className="fu d2" style={card}>
        <SectionHead icon={ICO.store} title="Store Branding"/>
        {ctx.storeId
          ?<LogoUpload
              storeId={ctx.storeId}
              currentLogo={logoUrl}
              onUploaded={url=>setLogoUrl(url)}/>
          :<p style={{fontSize:13,color:"#9ca3af"}}>No store found. Contact support.</p>}
      </div>

      {/* ── STORE INFO ── */}
      <div className="fu d3" style={card}>
        <SectionHead icon={ICO.store} title="Store Information"/>
        {/* Store badge row */}
        <div style={{display:"flex",alignItems:"center",gap:12,
          marginBottom:16,paddingBottom:16,borderBottom:"1px solid #f3f4f6"}}>
          <div style={{width:46,height:46,borderRadius:12,overflow:"hidden",
            flexShrink:0,background:NAVY,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            {logoUrl
              ?<img src={logoUrl} alt="logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              :<span style={{color:"#60a5fa",fontWeight:800,fontSize:15}}>
                {ctx.storeName.slice(0,2).toUpperCase()}
              </span>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:15,color:NAVY}}>{ctx.storeName}</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>
              {store?.category} · {store?.country}
            </div>
          </div>
          {/* Status pill */}
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",
            borderRadius:99,flexShrink:0,
            background:store?.status==="active"
              ?"rgba(22,163,74,.08)":store?.status==="blocked"
              ?"rgba(220,38,38,.08)":"rgba(217,119,6,.08)",
            border:`1px solid ${store?.status==="active"
              ?"rgba(22,163,74,.2)":store?.status==="blocked"
              ?"rgba(220,38,38,.2)":"rgba(217,119,6,.2)"}`}}>
            <div style={{width:6,height:6,borderRadius:"50%",
              background:store?.status==="active"?C.green
                :store?.status==="blocked"?C.red:C.amber}}/>
            <span style={{fontSize:11,fontWeight:700,
              color:store?.status==="active"?C.green
                :store?.status==="blocked"?C.red:C.amber,
              textTransform:"capitalize"}}>
              {store?.status??"pending"}
            </span>
          </div>
        </div>

        {/* Store details */}
        <div style={{display:"grid",gap:0}}>
          {[
            {l:"Store ID",    v:ctx.storeId||"—",       mono:true},
            {l:"Domain",      v:store?.domain||"—",      mono:false},
            {l:"Category",    v:store?.category||"—",    mono:false},
            {l:"Country",     v:store?.country||"—",     mono:false},
            {l:"Joined",      v:store?.joinedAt?.toDate?.().toLocaleDateString()||"—", mono:false},
            {l:"Total Orders",v:String(store?.totalOrders??0), mono:true},
            {l:"On-Time Rate",v:store?.totalOrders>0
              ?`${Math.round(((store.onTimeOrders??0)/(store.totalOrders??1))*100)}%`:"—", mono:false},
          ].map((r,i)=>(
            <div key={r.l} style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",padding:"9px 0",
              borderBottom:i<6?"1px solid #f8fafc":"none"}}>
              <span style={{fontSize:13,color:"#64748b"}}>{r.l}</span>
              <span style={{fontSize:12,fontWeight:600,color:NAVY,
                fontFamily:r.mono?"monospace":"inherit",
                maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",
                whiteSpace:"nowrap",textAlign:"right"}}>
                {r.v}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── KYC STATUS ONLY (no document images) ── */}
      <div className="fu d4" style={{...card,
        border:`1px solid ${
          kyc?.status==="approved"?"rgba(22,163,74,.2)":
          kyc?.status==="rejected"?"rgba(220,38,38,.2)":
          "rgba(37,99,235,.2)"}`}}>
        <SectionHead icon={ICO.shield} title="Identity Verification"/>
        {!kyc?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <Ico d={ICO.shield} s={32} c="#d1d5db"/>
            <p style={{fontSize:13,color:"#9ca3af",marginTop:10}}>
              No verification on file.
            </p>
          </div>
        ):(
          <div>
            {/* Status card */}
            <div style={{display:"flex",alignItems:"center",gap:12,
              padding:"14px 16px",borderRadius:12,marginBottom:kyc.rejectionReason?12:0,
              background:kyc.status==="approved"?"rgba(22,163,74,.06)":
                kyc.status==="rejected"?"rgba(220,38,38,.06)":"rgba(37,99,235,.06)",
              border:`1px solid ${kyc.status==="approved"?"rgba(22,163,74,.18)":
                kyc.status==="rejected"?"rgba(220,38,38,.18)":"rgba(37,99,235,.18)"}`}}>
              <div style={{width:40,height:40,borderRadius:11,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                background:kyc.status==="approved"?"rgba(22,163,74,.1)":
                  kyc.status==="rejected"?"rgba(220,38,38,.1)":"rgba(37,99,235,.1)",
                color:kyc.status==="approved"?C.green:
                  kyc.status==="rejected"?C.red:BLUE}}>
                <Ico d={ICO.shield} s={18}
                  c={kyc.status==="approved"?C.green:
                    kyc.status==="rejected"?C.red:BLUE}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,
                  color:kyc.status==="approved"?C.green:
                    kyc.status==="rejected"?C.red:BLUE,
                  textTransform:"capitalize",marginBottom:3}}>
                  {kyc.status==="approved"?"Identity Verified":
                    kyc.status==="rejected"?"Verification Failed":
                    "Verification Pending"}
                </div>
                <div style={{fontSize:12,color:"#64748b"}}>
                  {kyc.idType?.replace(/_/g," ")}
                  {kyc.idNumber&&` · ****${kyc.idNumber.slice(-4)}`}
                </div>
              </div>
              {kyc.status==="approved"&&(
                <div style={{flexShrink:0}}>
                  <Ico d={ICO.check} s={20} c={C.green}/>
                </div>
              )}
            </div>
            {/* Rejection reason */}
            {kyc.rejectionReason&&(
              <div style={{padding:"12px 14px",background:"rgba(220,38,38,.05)",
                borderRadius:10,border:"1px solid rgba(220,38,38,.15)",
                fontSize:13,color:"#374151",lineHeight:1.65}}>
                <strong style={{color:C.red}}>Reason:</strong> {kyc.rejectionReason}
                <div style={{marginTop:10}}>
                  <a href="/merchant/chat"
                    style={{fontSize:12,fontWeight:700,color:BLUE,textDecoration:"none"}}>
                    Contact support to resubmit →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PROFILE & STORE INFO ── */}
      <div className="fu d5" style={card}>
        <SectionHead icon={ICO.user} title="Profile"/>
        <form onSubmit={saveProfile}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}
            className="profile-grid">
            <div>
              <label style={lbl}>Full Name</label>
              <input style={inp()} value={name} onChange={e=>setName(e.target.value)}
                onFocus={e=>(e.target.style.borderColor=BLUE)}
                onBlur={e=>(e.target.style.borderColor="#e5e9f5")}/>
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp()} value={phone} onChange={e=>setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                onFocus={e=>(e.target.style.borderColor=BLUE)}
                onBlur={e=>(e.target.style.borderColor="#e5e9f5")}/>
            </div>
          </div>
          <div style={{marginTop:12}}>
            <label style={lbl}>Email</label>
            <input
              style={{...inp(),background:"#f8fafc",color:"#94a3b8",cursor:"not-allowed"}}
              value={ctx.email} disabled/>
          </div>
          <div style={{marginTop:12}}>
            <label style={lbl}>Store Bio</label>
            <textarea value={bio} onChange={e=>setBio(e.target.value)}
              placeholder="Describe your store to customers…"
              style={{...inp(),minHeight:80,resize:"vertical" as const,
                fontFamily:"inherit",display:"block"}}
              onFocus={e=>(e.target.style.borderColor=BLUE)}
              onBlur={e=>(e.target.style.borderColor="#e5e9f5")}/>
          </div>
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button type="submit" disabled={savingP}
              style={{...primaryBtn,opacity:savingP?.6:1}}>
              {savingP?"Saving…":"Save Profile"}
            </button>
          </div>
        </form>
      </div>

      {/* ── CHANGE PASSWORD ── */}
      <div className="fu d6" style={card}>
        <SectionHead icon={ICO.lock} title="Password"/>
        <form onSubmit={changePw}>
          <label style={lbl}>Current Password</label>
          <PwInput value={oldPw} onChange={setOldPw} placeholder="Enter current password"/>

          <label style={lbl}>New Password</label>
          <PwInput value={newPw} onChange={setNewPw} placeholder="Enter new password"/>
          <PwStrength pw={newPw}/>

          <div style={{display:"flex",gap:10}}>
            <button type="submit"
              disabled={savingPw||!oldPw||newPw.length<8}
              style={{...primaryBtn,
                opacity:(savingPw||!oldPw||newPw.length<8)?.5:1}}>
              {savingPw?"Updating…":"Update Password"}
            </button>
            {(oldPw||newPw)&&(
              <button type="button"
                onClick={()=>{ setOldPw(""); setNewPw(""); }}
                style={ghostBtn}>
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── NOTIFICATIONS ── */}
      <div className="fu d7" style={card}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:32,height:32,borderRadius:9,
              background:"rgba(37,99,235,.08)",border:"1px solid rgba(37,99,235,.15)",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Ico d={ICO.bell} s={15} c={BLUE}/>
            </div>
            <div style={{fontWeight:700,fontSize:15,color:NAVY}}>Notifications</div>
          </div>
          <button onClick={saveNotifs} disabled={savingN}
            style={{padding:"7px 16px",borderRadius:9,cursor:"pointer",
              border:`1.5px solid rgba(37,99,235,.25)`,
              background:"rgba(37,99,235,.06)",color:BLUE,
              fontWeight:700,fontSize:12,
              opacity:savingN?.6:1,transition:"all .15s"}}
            onMouseEnter={e=>((e.currentTarget as any).style.background="rgba(37,99,235,.1)")}
            onMouseLeave={e=>((e.currentTarget as any).style.background="rgba(37,99,235,.06)")}>
            {savingN?"Saving…":"Save Preferences"}
          </button>
        </div>
        {[
          {k:"newOrder",     l:"New Orders",         d:"Alert when a customer places an order"},
          {k:"deposit",      l:"Deposit Confirmed",  d:"Alert when your crypto deposit is verified"},
          {k:"withdrawal",   l:"Withdrawal Updates", d:"Alert when admin processes your withdrawal"},
          {k:"kyc",          l:"Verification Status",d:"Alert when your KYC is approved or rejected"},
          {k:"weeklyReport", l:"Weekly Summary",     d:"Email report of your sales and earnings"},
          {k:"lowStock",     l:"Low Stock Alerts",   d:"Alert when a variant falls below 5 units"},
        ].map(n=>(
          <Toggle key={n.k} label={n.l} desc={n.d}
            value={(notifs as any)[n.k]}
            onChange={v=>setNotifs(p=>({...p,[n.k]:v}))}/>
        ))}
      </div>

      {/* ── REFERRAL CODE ── */}
      <div className="fu d8" style={{...card,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:NAVY,marginBottom:2}}>
              Your Referral Code
            </div>
            <div style={{fontSize:12,color:"#64748b"}}>
              Share this code with other merchants to invite them
            </div>
          </div>
          {referrals.length>0&&(
            <div style={{background:"rgba(22,163,74,.08)",
              border:"1px solid rgba(22,163,74,.2)",
              borderRadius:99,padding:"4px 12px",
              fontSize:11,fontWeight:700,color:"#16a34a"}}>
              {referrals.length} invited
            </div>
          )}
        </div>

        {/* Code + Copy — 3 states: loading / missing / ready */}
        {refLoading ? (
          /* Loading */
          <div style={{background:"#f8fafc",border:"1.5px solid #e5e7eb",borderRadius:12,
            padding:"18px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
            <span style={{width:16,height:16,borderRadius:"50%",flexShrink:0,
              border:"2.5px solid rgba(148,163,184,.25)",borderTopColor:"#94a3b8",
              display:"inline-block",animation:"spin .8s linear infinite"}}/>
            <span style={{fontSize:13,color:"#64748b"}}>Loading your referral code…</span>
          </div>

        ) : !referralCode ? (
          /* Missing — offer manual generate */
          <div style={{background:"rgba(217,119,6,.05)",border:"1.5px solid rgba(217,119,6,.2)",
            borderRadius:12,padding:"16px",marginBottom:12}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:14}}>
              <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
                background:"rgba(217,119,6,.1)",display:"flex",
                alignItems:"center",justifyContent:"center"}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#d97706"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13.5,color:"#d97706",marginBottom:3}}>
                  No referral code yet
                </div>
                <div style={{fontSize:12,color:"#64748b",lineHeight:1.65}}>
                  Your account was created before referrals launched. Generate one now to start
                  inviting merchants and earning rewards.
                </div>
              </div>
            </div>
            <button
              onClick={createReferralCode}
              disabled={makingCode}
              style={{width:"100%",padding:"12px",borderRadius:10,border:"none",
                background:makingCode?"rgba(217,119,6,.4)":`linear-gradient(135deg,${NAVY},#1e3a6e)`,
                color:"#c9a84c",fontWeight:700,fontSize:13,
                cursor:makingCode?"not-allowed":"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {makingCode
                ? <><span style={{width:13,height:13,borderRadius:"50%",
                    border:"2.5px solid rgba(201,168,76,.3)",borderTopColor:"#c9a84c",
                    display:"inline-block",animation:"spin .7s linear infinite"}}/> Generating…</>
                : "Generate My Referral Code"}
            </button>
          </div>

        ) : (
          /* Ready */
          <div style={{background:"#f8fafc",border:"1.5px solid #e5e7eb",
            borderRadius:12,padding:"14px 16px",
            display:"flex",alignItems:"center",
            justifyContent:"space-between",gap:12,marginBottom:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9,fontWeight:700,color:"#94a3b8",
                textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:4}}>
                Your Code
              </div>
              <div style={{fontFamily:"monospace",fontWeight:900,
                fontSize:22,color:NAVY,letterSpacing:"2px",wordBreak:"break-all"}}>
                {referralCode}
              </div>
            </div>
            <button
              onClick={()=>{
                navigator.clipboard?.writeText(referralCode);
                toast.success("Referral code copied!");
              }}
              style={{padding:"10px 18px",borderRadius:9,border:"none",
                background:NAVY,color:"#c9a84c",fontWeight:700,
                fontSize:12,cursor:"pointer",flexShrink:0,
                boxShadow:"0 2px 8px rgba(15,23,42,.2)"}}>
              Copy Code
            </button>
          </div>
        )}

        {/* Share link */}
        {referralCode&&(
          <div style={{background:"rgba(37,99,235,.05)",
            border:"1px solid rgba(37,99,235,.15)",
            borderRadius:10,padding:"10px 14px",marginBottom:12,
            display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>
                Invite Link
              </div>
              <div style={{fontSize:11,color:"#374151",fontFamily:"monospace",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {`merchantsignup.vercel.app/signup?ref=${referralCode}`}
              </div>
            </div>
            <button
              onClick={()=>{
                navigator.clipboard?.writeText(`https://merchantsignup.vercel.app/signup?ref=${referralCode}`);
                toast.success("Invite link copied!");
              }}
              style={{padding:"7px 12px",borderRadius:8,cursor:"pointer",
                border:"1.5px solid rgba(37,99,235,.2)",
                background:"rgba(37,99,235,.06)",
                color:BLUE,fontWeight:600,fontSize:11,flexShrink:0}}>
              Copy Link
            </button>
          </div>
        )}

        {/* People invited */}
        {referrals.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",
              textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>
              People you've invited ({referrals.length})
            </div>
            <div style={{display:"grid",gap:6}}>
              {referrals.map((r:any)=>(
                <div key={r.id} style={{display:"flex",alignItems:"center",
                  gap:10,padding:"9px 12px",borderRadius:9,
                  background:"#f8fafc",border:"1px solid #f0f2f5"}}>
                  <div style={{width:30,height:30,borderRadius:8,
                    background:NAVY,display:"flex",alignItems:"center",
                    justifyContent:"center",color:"#c9a84c",
                    fontWeight:700,fontSize:11,flexShrink:0}}>
                    {(r.displayName??"?").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:NAVY,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {r.displayName}
                    </div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{r.email}</div>
                  </div>
                  <div style={{fontSize:10,fontWeight:700,color:"#16a34a",
                    background:"rgba(22,163,74,.08)",
                    padding:"2px 8px",borderRadius:99,flexShrink:0}}>
                    Joined
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SIGN OUT ── */}
      <div className="fu d8" style={{...card,border:"1px solid rgba(220,38,38,.15)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:12}}>
          <div style={{width:32,height:32,borderRadius:9,
            background:"rgba(220,38,38,.07)",border:"1px solid rgba(220,38,38,.15)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Ico d={ICO.logout} s={15} c={C.red}/>
          </div>
          <div style={{fontWeight:700,fontSize:15,color:C.red}}>Sign Out</div>
        </div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:14}}>
          Signed in as{" "}
          <strong style={{color:NAVY}}>{ctx.email}</strong>
        </div>
        <button
          onClick={async()=>{await signOut(auth);router.replace("/login");}}
          style={{...ghostBtn,
            color:C.red,
            border:"1px solid rgba(220,38,38,.2)",
            background:"rgba(220,38,38,.04)"}}>
          Sign out of this device
        </button>
      </div>

      <style>{`
        .profile-grid{grid-template-columns:1fr 1fr}
        @media(max-width:500px){
          .profile-grid{grid-template-columns:1fr!important}
        }
      
        @keyframes spin { to { transform:rotate(360deg) } }
        /* 16px minimum stops iOS Safari auto-zooming on focus */
        input, select, textarea { font-size:16px !important; }
        html, body { overflow-x:hidden; -webkit-text-size-adjust:100%; }
        button, a, label { -webkit-tap-highlight-color:transparent; }
      `}</style>
    </div>
  );
}
