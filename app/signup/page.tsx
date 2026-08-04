// app/signup/page.tsx — with store logo + KYC document photo uploads
"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, addDoc, collection, serverTimestamp, updateDoc, getDocs, query, where } from "firebase/firestore";
import { generateReferralCode, validateReferralCode, createReferralCode } from "@/lib/hooks";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth, db, storage } from "@/lib/firebase/client";
import toast from "react-hot-toast";

const GOLD = "#c9a84c";
const DARK = "#0a0a0a";
const C = { green:"#16a34a" };

const COUNTRIES = ["United States","United Kingdom","Canada","Australia","Germany","France","UAE","Saudi Arabia","Nigeria","Kenya","Ghana","South Africa","India","Singapore","Malaysia","Philippines","Indonesia","Brazil","Mexico","Pakistan","Egypt","Morocco","Jordan","Turkey","Netherlands","Spain","Italy","Sweden","Norway","Switzerland","Japan","South Korea","China","Hong Kong","Thailand","Vietnam","Argentina","Colombia","Other"];
const CATEGORIES = ["Electronics & Accessories","Men's Clothing","Women's Clothing","Men's Shoes","Women's Shoes","Men's Bags","Women's Bags","Fitness & Sports","Kitchen & Home","Kids & Baby","Beauty & Skincare","General & Lifestyle"];
const ID_TYPES = [{v:"passport",l:"Passport"},{v:"national_id",l:"National ID Card"},{v:"drivers_license",l:"Driver's License"}];

const blank = {
  name:"", email:"", password:"", confirm:"", phone:"",
  storeName:"", domain:"", category:"Electronics & Accessories", country:"",
  idType:"passport", idNumber:"", dateOfBirth:"", idExpiry:"", address:"",
};

// ── Upload helper ─────────────────────────────────────────────
async function uploadFile(file:File, path:string, onProgress:(n:number)=>void): Promise<string> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on("state_changed",
      s => onProgress(Math.round((s.bytesTransferred/s.totalBytes)*100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

// ── Logo Upload Box ───────────────────────────────────────────
function LogoUploadBox({ preview, progress, onChange }:{
  preview:string|null; progress:number|null; onChange:(f:File)=>void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handle(file:File) {
    if(!file.type.startsWith("image/")) { toast.error("Please upload an image."); return; }
    if(file.size > 5*1024*1024) { toast.error("Logo must be under 5MB."); return; }
    onChange(file);
  }

  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>
        Store Logo <span style={{fontSize:11,color:"#9ca3af",fontWeight:400}}>(optional — can add later)</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        {/* Preview circle */}
        <div style={{width:72,height:72,borderRadius:16,overflow:"hidden",flexShrink:0,border:`2px dashed ${preview?GOLD:"#e5e7eb"}`,background:preview?"#fdf8ee":"#f9fafb",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,transition:"border-color .2s"}}>
          {preview
            ? <img src={preview} alt="Logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            : "🏪"}
        </div>

        {/* Upload zone */}
        <div
          onClick={()=>inputRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)handle(f);}}
          style={{flex:1,border:`2px dashed ${drag?GOLD:preview?"#c9a84c50":"#e5e7eb"}`,borderRadius:12,padding:"14px 16px",textAlign:"center",cursor:"pointer",background:drag?"rgba(201,168,76,.04)":preview?"#fdf8ee":"#fafafa",transition:"all .2s"}}>
          {progress!==null ? (
            <div>
              <div style={{fontSize:12,fontWeight:600,color:GOLD,marginBottom:6}}>Uploading… {progress}%</div>
              <div style={{height:4,background:"#e5e7eb",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${DARK},${GOLD})`,borderRadius:99,transition:"width .2s"}}/>
              </div>
            </div>
          ) : preview ? (
            <div style={{fontSize:12,color:C.green,fontWeight:600}}>✓ Logo uploaded · <span style={{color:GOLD}}>Click to change</span></div>
          ) : (
            <>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:2}}>Click or drag to upload</div>
              <div style={{fontSize:11,color:"#9ca3af"}}>PNG, JPG · Max 5MB</div>
            </>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={e=>{const f=e.target.files?.[0];if(f)handle(f);e.target.value="";}}/>
    </div>
  );
}

// ── Photo Upload Box ──────────────────────────────────────────
function PhotoUploadBox({ label, hint, preview, progress, onChange, required=false }:{
  label:string; hint:string; preview:string|null; progress:number|null; onChange:(f:File)=>void; required?:boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handle(file:File) {
    if(!file.type.startsWith("image/")) { toast.error("Please upload an image."); return; }
    if(file.size>10*1024*1024) { toast.error("File must be under 10MB."); return; }
    onChange(file);
  }

  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:6}}>
        {label}{required&&<span style={{color:GOLD}}> *</span>}
      </div>
      <div onClick={()=>inputRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)handle(f);}}
        style={{border:`2px dashed ${drag?GOLD:preview?"#c9a84c50":"#e5e7eb"}`,borderRadius:12,padding:preview?"8px":"20px 16px",textAlign:"center",cursor:"pointer",background:drag?"rgba(201,168,76,.04)":preview?"#fdf8ee":"#fafafa",transition:"all .2s"}}>
        {progress!==null ? (
          <div style={{padding:"8px 0"}}>
            <div style={{fontSize:12,fontWeight:600,color:GOLD,marginBottom:8}}>Uploading… {progress}%</div>
            <div style={{height:5,background:"#e5e7eb",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${DARK},${GOLD})`,borderRadius:99,transition:"width .2s"}}/>
            </div>
          </div>
        ) : preview ? (
          <div style={{position:"relative"}}>
            <img src={preview} alt={label} style={{width:"100%",maxHeight:140,objectFit:"cover",borderRadius:8,display:"block"}}/>
            <div style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.55)",borderRadius:6,padding:"3px 8px",fontSize:10,color:"#fff",fontWeight:600}}>Tap to change</div>
            <div style={{position:"absolute",top:6,left:6,background:"rgba(22,163,74,.9)",borderRadius:6,padding:"3px 8px",fontSize:10,color:"#fff",fontWeight:700}}>✓ Uploaded</div>
          </div>
        ) : (
          <>
            <div style={{fontSize:28,marginBottom:6}}>📷</div>
            <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:2}}>Click or drag to upload</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{hint}</div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{display:"none"}}
        onChange={e=>{const f=e.target.files?.[0];if(f)handle(f);e.target.value="";}}/>
    </div>
  );
}

function SignupPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [step,           setStep]           = useState(1);
  const [referralInput,  setReferralInput]  = useState("");
  const [referralError,  setReferralError]  = useState("");
  const [referralValid,  setReferralValid]  = useState<{uid:string;name:string}|null>(null);
  const [checkingRef,    setCheckingRef]    = useState(false);
  const [form, setForm]       = useState(blank);
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);

  // Logo
  const [logoFile, setLogoFile]       = useState<File|null>(null);
  const [logoPreview, setLogoPreview] = useState<string|null>(null);
  const [logoProgress, setLogoProgress] = useState<number|null>(null);

  // KYC photos
  const [idFrontFile, setIdFrontFile]       = useState<File|null>(null);
  const [idBackFile, setIdBackFile]         = useState<File|null>(null);
  const [idFrontPreview, setIdFrontPreview] = useState<string|null>(null);
  const [idBackPreview, setIdBackPreview]   = useState<string|null>(null);
  const [frontProgress, setFrontProgress]   = useState<number|null>(null);
  const [backProgress, setBackProgress]     = useState<number|null>(null);

  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}));

  function handleLogo(file:File) {
    setLogoFile(file);
    const r = new FileReader();
    r.onload = e => setLogoPreview(e.target?.result as string);
    r.readAsDataURL(file);
  }
  function handleIdFront(file:File) {
    setIdFrontFile(file);
    const r = new FileReader();
    r.onload = e => setIdFrontPreview(e.target?.result as string);
    r.readAsDataURL(file);
  }
  function handleIdBack(file:File) {
    setIdBackFile(file);
    const r = new FileReader();
    r.onload = e => setIdBackPreview(e.target?.result as string);
    r.readAsDataURL(file);
  }

  function validate(s:number) {
    if(s===1) {
      if(!form.name.trim())          { toast.error("Full name is required."); return false; }
      if(!form.email.trim())         { toast.error("Email address is required."); return false; }
      if(!form.password)             { toast.error("Password is required."); return false; }
      if(form.password.length<8)     { toast.error("Password must be at least 8 characters."); return false; }
      if(form.password!==form.confirm){ toast.error("Passwords do not match."); return false; }
    }
    if(s===2) {
      if(!form.storeName.trim())     { toast.error("Store name is required."); return false; }
      if(!form.domain.trim())        { toast.error("Store domain is required."); return false; }
      if(!form.country)              { toast.error("Please select your country."); return false; }
    }
    if(s===3) {
      if(!form.idNumber.trim())      { toast.error("ID number is required."); return false; }
      if(!form.dateOfBirth)          { toast.error("Date of birth is required."); return false; }
      if(!idFrontFile)               { toast.error("Please upload your ID front photo."); return false; }
    }
    return true;
  }

  async function checkReferralCode(code: string) {
    if (!code.trim()) { setReferralValid(null); setReferralError(""); return; }
    setCheckingRef(true);
    setReferralError("");
    const result = await validateReferralCode(code);
    if (result) {
      setReferralValid(result);
    } else {
      setReferralValid(null);
      setReferralError("Invalid referral code");
    }
    setCheckingRef(false);
  }

  // Pre-fill referral code from URL ?ref= param
  useEffect(()=>{
    const refParam = searchParams.get("ref");
    if (refParam) {
      const v = refParam.toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,12);
      setReferralInput(v);
      if (v.length>=6) checkReferralCode(v);
    }
  },[]);

  async function submit() {
    setLoading(true);
    try {
      // 1. Create auth user
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid  = cred.user.uid;

      // 2. Upload KYC photos
      let idFrontUrl = "", idBackUrl = "";
      if(idFrontFile) {
        setFrontProgress(0);
        idFrontUrl = await uploadFile(idFrontFile, `kyc-documents/${uid}/id-front-${Date.now()}`, setFrontProgress);
        setFrontProgress(null);
      }
      if(idBackFile) {
        setBackProgress(0);
        idBackUrl = await uploadFile(idBackFile, `kyc-documents/${uid}/id-back-${Date.now()}`, setBackProgress);
        setBackProgress(null);
      }

      // 3. Generate referral code for new merchant
      const newReferralCode = generateReferralCode(form.name);

      // 3a. Use already-validated referral result (no need to re-query)
      const referredByUid = referralValid?.uid ?? "";

      // 3b. Create user doc
      await setDoc(doc(db,"users",uid), {
        uid, email:form.email, displayName:form.name, role:"merchant",
        phone:form.phone, country:form.country, kycVerified:false,
        referralCode:   newReferralCode,
        referredBy:     referralInput.trim().toUpperCase() || null,
        referredByUid:  referredByUid || null,
        createdAt:serverTimestamp(), lastLogin:serverTimestamp(),
      });

      // 3c. Register the new merchant's referral code
      await createReferralCode(newReferralCode, uid, form.name);

      // 4. Create store doc
      const storeRef = await addDoc(collection(db,"stores"), {
        merchantId:uid,
        merchantName:form.name,
        merchantEmail:form.email,
        storeName:form.storeName,
        domain:`${form.domain}.targetglobal.org`,
        category:form.category, country:form.country,
        plan:"starter", status:"pending",
        commissionRate:0.03, merchantMargin:0.20,
        maxProducts:10, rating:0, totalOrders:0, onTimeOrders:0,
        logoUrl:"",
        joinedAt:serverTimestamp(), settings:{currency:"USD",salesTarget:10000,deliveryDays:3},
      });

      // 5. Upload store logo (now we have storeId)
      if(logoFile) {
        setLogoProgress(0);
        const logoUrl = await uploadFile(
          logoFile,
          `store-logos/${storeRef.id}/${Date.now()}_logo`,
          setLogoProgress
        );
        setLogoProgress(null);
        await updateDoc(doc(db,"stores",storeRef.id), { logoUrl });
      }

      // 6. KYC submission
      await addDoc(collection(db,"kyc_submissions"), {
        merchantId:uid, storeId:storeRef.id,
        storeName:form.storeName, merchantName:form.name, merchantEmail:form.email,
        idType:form.idType, idNumber:form.idNumber, dateOfBirth:form.dateOfBirth,
        issuingCountry:form.country, idExpiryDate:form.idExpiry,
        fullAddress:form.address, country:form.country,
        idFrontUrl, idBackUrl,
        status:"pending", submittedAt:serverTimestamp(),
      });

      // 7. Wallet
      await addDoc(collection(db,"wallets"), {
        merchantId:uid, storeId:storeRef.id,
        balances:{BTC:0,ETH:0,USDT_TRC20:0,USDT_ERC20:0}, usdEquivalent:0, updatedAt:serverTimestamp(),
      });

      // 8. Deposit addresses
      // ⚠️  Only add addresses for coins you actively support.
      // Add NEXT_PUBLIC_USDT_TRC20 (and others you support) in Vercel env vars.
      const depositAddresses = [
        process.env.NEXT_PUBLIC_USDT_TRC20 && { coin:"USDT", network:"TRC20", address: process.env.NEXT_PUBLIC_USDT_TRC20 },
        process.env.NEXT_PUBLIC_USDT_ERC20 && { coin:"USDT", network:"ERC20", address: process.env.NEXT_PUBLIC_USDT_ERC20 },
        process.env.NEXT_PUBLIC_BTC_ADDRESS && { coin:"BTC",  network:"Bitcoin",  address: process.env.NEXT_PUBLIC_BTC_ADDRESS },
        process.env.NEXT_PUBLIC_ETH_ADDRESS && { coin:"ETH",  network:"Ethereum", address: process.env.NEXT_PUBLIC_ETH_ADDRESS },
      ].filter(Boolean);

      for (const a of depositAddresses) {
        await addDoc(collection(db,"deposit_addresses"), {
          merchantId:uid, storeId:storeRef.id, ...a, isActive:true, createdAt:serverTimestamp(),
        });
      }

      // 9. Welcome notification
      await addDoc(collection(db,"notifications"), {
        userId:uid, title:"🎉 Welcome to TargetGlobal!", read:false, type:"kyc",
        body:`Hi ${form.name.split(" ")[0]}, your store "${form.storeName}" is being reviewed. We\'ll notify you once it\'s live (usually within 24 hours).`,
        createdAt:serverTimestamp(),
      });

      // ── Send emails (non-blocking) ──
      const emailBase = { method:"POST", headers:{"Content-Type":"application/json"} };

      // 1. Welcome email → merchant
      fetch("/api/send-email", {
        ...emailBase,
        body: JSON.stringify({
          type:"welcome",
          to: form.email,
          name: form.name,
          storeName: form.storeName,
          country: form.country,
        }),
      }).catch(e=>console.warn("Welcome email failed:",e));

      // 2. Alert email → admin
      fetch("/api/send-email", {
        ...emailBase,
        body: JSON.stringify({
          type:"admin_new_merchant",
          merchantEmail: form.email,
          name: form.name,
          storeName: form.storeName,
          country: form.country,
          idType: form.idType,
        }),
      }).catch(e=>console.warn("Admin alert email failed:",e));

      toast.success("Store created! We\'ll review your ID and activate it within 24 hours.");
      router.push("/merchant/dashboard");
    } catch(err:any) {
      // Reset all upload progress indicators on error
      setLogoProgress(null);
      setFrontProgress(null);
      setBackProgress(null);
      console.error("Signup failed:", err.code, err.message, err);
      toast.error(
        err.code==="auth/email-already-in-use" ? "An account with this email already exists." :
        err.code==="auth/weak-password"        ? "Password is too weak. Use at least 8 characters." :
        `Registration failed: ${err.code || err.message || "unknown error"}`
      );
      setLoading(false);
    }
  }

  const inp:React.CSSProperties = {width:"100%",padding:"13px 14px",border:"1.5px solid #e5e7eb",borderRadius:10,fontSize:16,outline:"none",color:"#111827",background:"#fff",transition:"border .2s",marginBottom:14,boxSizing:"border-box" as const};
  const lbl:React.CSSProperties = {display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:5};
  const sel:React.CSSProperties = {...inp,cursor:"pointer",background:"#fff"};
  const STEPS = ["Account","Your Store","Verify ID","Review"];
  const pct   = ((step-1)/3)*100;

  return (
    <div style={{minHeight:"100dvh",background:"#f9fafb",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 14px",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:520}}>

        {/* Brand */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
            <img src="/logo-icon.png" alt="TargetGlobal" style={{height:52,width:"auto"}}
              onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";(e.currentTarget.nextElementSibling as HTMLElement).style.display="flex";}}/>
            <div style={{display:"none",alignItems:"center",gap:8}}>
              <div style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${DARK},${GOLD})`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
              </div>
              <span style={{fontWeight:900,fontSize:20,color:"#111827"}}>TargetGlobal</span>
            </div>
          </div>
          <h1 style={{fontWeight:800,fontSize:24,color:"#111827",marginBottom:4,letterSpacing:"-.3px"}}>Create your store</h1>
          <p style={{color:"#6b7280",fontSize:14}}>Free to join · No monthly fees · Earn 20% on every sale</p>
        </div>

        {/* Progress */}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            {STEPS.map((s,i)=>(
              <div key={s} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
                <div style={{width:28,height:28,borderRadius:"50%",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                  background:step>i+1?DARK:step===i+1?DARK:"#e5e7eb",
                  color:step>=i+1?GOLD:"#9ca3af"}}>
                  {step>i+1?"✓":i+1}
                </div>
                <div style={{fontSize:9,fontWeight:600,color:step>=i+1?GOLD:"#9ca3af",textAlign:"center"}}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{height:3,background:"#e5e7eb",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${DARK},${GOLD})`,borderRadius:99,transition:"width .4s"}}/>
          </div>
        </div>

        {/* Card */}
        <div className="signup-card" style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 4px 24px rgba(0,0,0,.08)",border:"1px solid #e5e7eb"}}>

          {/* STEP 1 — Account */}
          {step===1&&<>
            <div style={{fontWeight:700,fontSize:17,marginBottom:4}}>Account Details</div>
            <p style={{fontSize:13,color:"#6b7280",marginBottom:20}}>Create your secure merchant account</p>
            <label style={lbl}>Full Name *</label>
            <input style={inp} placeholder="John Smith" value={form.name} onChange={e=>set("name",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
            <label style={lbl}>Email Address *</label>
            <input style={inp} type="email" placeholder="john@example.com" value={form.email} onChange={e=>set("email",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
            <label style={lbl}>Phone Number</label>
            <input style={inp} type="tel" placeholder="+1 555 000 0000" value={form.phone} onChange={e=>set("phone",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
            {/* ── Referral code ── */}
            <label style={lbl}>Referral Code <span style={{color:"#94a3b8",fontWeight:400}}>(optional)</span></label>
            <div style={{position:"relative",marginBottom:4}}>
              <input
                type="text"
                value={referralInput}
                onChange={e=>{
                  const v=e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,"");
                  setReferralInput(v);
                  if(v.length>=6) checkReferralCode(v);
                  else { setReferralValid(null); setReferralError(""); }
                }}
                placeholder="e.g. AHMED-X7K2"
                maxLength={12}
                style={{...inp,paddingRight:90,marginBottom:0,
                  borderColor:referralValid?"#16a34a":referralError?"#dc2626":"#e5e7eb",
                  background:referralValid?"rgba(22,163,74,.03)":"#fff"}}
                onFocus={e=>(e.target.style.borderColor=referralValid?"#16a34a":referralError?"#dc2626":GOLD)}
                onBlur={e=>(e.target.style.borderColor=referralValid?"#16a34a":referralError?"#dc2626":"#e5e7eb")}/>
              <div style={{position:"absolute",right:12,top:"50%",
                transform:"translateY(-50%)",fontSize:12,fontWeight:600,pointerEvents:"none"}}>
                {checkingRef&&<span style={{color:"#94a3b8"}}>Checking…</span>}
                {!checkingRef&&referralValid&&<span style={{color:"#16a34a"}}>✓ Valid</span>}
                {!checkingRef&&referralError&&<span style={{color:"#dc2626"}}>✗ Invalid</span>}
              </div>
            </div>
            {referralValid&&(
              <div style={{fontSize:12,color:"#16a34a",marginBottom:4,fontWeight:500}}>
                ✓ Invited by {referralValid.name}
              </div>
            )}
            {referralError&&(
              <div style={{fontSize:12,color:"#dc2626",marginBottom:4}}>{referralError}</div>
            )}
            {!referralValid&&!referralError&&(
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>
                If someone invited you, enter their code here
              </div>
            )}

            <label style={lbl}>Password *</label>
            <div style={{position:"relative"}}>
              <input style={{...inp,paddingRight:44}} type={showPw?"text":"password"} placeholder="At least 8 characters" value={form.password} onChange={e=>set("password",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
              <button type="button" onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-60%)",background:"transparent",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:16}}>{showPw?"Hide":"Show"}</button>
            </div>
            <label style={lbl}>Confirm Password *</label>
            <input style={{...inp,marginBottom:0}} type="password" placeholder="Repeat password" value={form.confirm} onChange={e=>set("confirm",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
          </>}

          {/* STEP 2 — Store (with logo upload) */}
          {step===2&&<>
            <div style={{fontWeight:700,fontSize:17,marginBottom:4}}>Store Details</div>
            <p style={{fontSize:13,color:"#6b7280",marginBottom:20}}>Set up your online storefront</p>

            {/* Store Logo Upload */}
            <LogoUploadBox preview={logoPreview} progress={logoProgress} onChange={handleLogo}/>

            <label style={lbl}>Store Name *</label>
            <input style={inp} placeholder="e.g. TrendHive Store" value={form.storeName} onChange={e=>set("storeName",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>

            <label style={lbl}>Store URL Handle *</label>
            <div style={{position:"relative",marginBottom:14}}>
              <input style={{...inp,marginBottom:0,paddingRight:170}} placeholder="mystore" value={form.domain} onChange={e=>set("domain",e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
              <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#9ca3af",pointerEvents:"none"}}>.targetglobal.org</span>
            </div>

            <label style={lbl}>Product Category</label>
            <select style={sel} value={form.category} onChange={e=>set("category",e.target.value)}>
              {CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>

            <label style={lbl}>Country *</label>
            <select style={{...sel,marginBottom:0}} value={form.country} onChange={e=>set("country",e.target.value)}>
              <option value="">Select your country</option>
              {COUNTRIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </>}

          {/* STEP 3 — KYC */}
          {step===3&&<>
            <div style={{fontWeight:700,fontSize:17,marginBottom:4}}>Identity Verification</div>
            <div style={{background:"#fdf8ee",border:"1px solid rgba(201,168,76,.3)",borderRadius:10,padding:"12px 14px",marginBottom:20,fontSize:13,color:"#92400e",lineHeight:1.6}}>
              🛡️ Your documents are encrypted and only seen by our verification team. Never shared with third parties.
            </div>
            <label style={lbl}>ID Type *</label>
            <select style={sel} value={form.idType} onChange={e=>set("idType",e.target.value)}>
              {ID_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            <label style={lbl}>ID Number *</label>
            <input style={inp} placeholder="e.g. A12345678" value={form.idNumber} onChange={e=>set("idNumber",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Date of Birth *</label>
                <input style={{...inp,marginBottom:0}} type="date" value={form.dateOfBirth} onChange={e=>set("dateOfBirth",e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>ID Expiry Date</label>
                <input style={{...inp,marginBottom:0}} type="date" value={form.idExpiry} onChange={e=>set("idExpiry",e.target.value)}/>
              </div>
            </div>
            <label style={lbl}>Residential Address</label>
            <input style={inp} placeholder="123 Main St, City, ZIP" value={form.address} onChange={e=>set("address",e.target.value)} onFocus={e=>(e.target.style.borderColor=GOLD)} onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
            <div style={{borderTop:"1px solid #f3f4f6",paddingTop:16,marginTop:4}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>ID Photos</div>
              <p style={{fontSize:12,color:"#9ca3af",marginBottom:14,lineHeight:1.6}}>Clear photos of your ID. Max 10MB each.</p>
              <PhotoUploadBox label="ID Front Photo" hint="Front side of your ID" preview={idFrontPreview} progress={frontProgress} onChange={handleIdFront} required/>
              <PhotoUploadBox label="ID Back Photo" hint="Back side (not required for passport)" preview={idBackPreview} progress={backProgress} onChange={handleIdBack}/>
            </div>
          </>}

          {/* STEP 4 — Review */}
          {step===4&&<>
            <div style={{fontWeight:700,fontSize:17,marginBottom:4}}>Review & Launch</div>
            <p style={{fontSize:13,color:"#6b7280",marginBottom:20}}>Confirm your details before creating your store</p>

            {/* Logo preview in review */}
            {logoPreview&&(
              <div style={{display:"flex",alignItems:"center",gap:12,background:"#fdf8ee",borderRadius:12,padding:"12px 14px",marginBottom:14,border:`1px solid ${GOLD}30`}}>
                <img src={logoPreview} alt="Store logo" style={{width:48,height:48,borderRadius:10,objectFit:"cover",border:"1px solid #e5e7eb",flexShrink:0}}/>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:DARK}}>{form.storeName}</div>
                  <div style={{fontSize:11,color:C.green,marginTop:2}}>✓ Logo ready to upload</div>
                </div>
              </div>
            )}

            <div style={{background:"#f9fafb",borderRadius:12,padding:16,marginBottom:16}}>
              {[
                ["Name",          form.name],
                ["Email",         form.email],
                ["Store",         form.storeName],
                ["URL",           `${form.domain}.targetglobal.org`],
                ["Category",      form.category],
                ["Country",       form.country],
                ["ID Type",       ID_TYPES.find(t=>t.v===form.idType)?.l??""],
                ["ID Number",     form.idNumber],
                ["Date of Birth", form.dateOfBirth],
              ].map(([k,v])=>(
                <div key={k as string} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #e5e7eb"}}>
                  <span style={{fontSize:13,color:"#6b7280"}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:600,color:"#111827",textAlign:"right",maxWidth:"55%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v||"—"}</span>
                </div>
              ))}
            </div>

            {/* ID photo thumbnails */}
            {(idFrontPreview||idBackPreview)&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {idFrontPreview&&<div>
                  <div style={{fontSize:10,fontWeight:700,color:"#6b7280",marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>ID Front ✓</div>
                  <img src={idFrontPreview} alt="ID Front" style={{width:"100%",height:80,objectFit:"cover",borderRadius:8,border:"1px solid #e5e7eb"}}/>
                </div>}
                {idBackPreview&&<div>
                  <div style={{fontSize:10,fontWeight:700,color:"#6b7280",marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>ID Back ✓</div>
                  <img src={idBackPreview} alt="ID Back" style={{width:"100%",height:80,objectFit:"cover",borderRadius:8,border:"1px solid #e5e7eb"}}/>
                </div>}
              </div>
            )}

            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"12px 14px",fontSize:12,color:"#166534",lineHeight:1.7}}>
              ✅ Your crypto wallet will be created automatically<br/>
              {logoFile&&<>🖼️ Store logo will be uploaded<br/></>}
              ⏳ Store review takes up to 24 hours<br/>
              🔒 ID documents securely stored and encrypted
            </div>
          </>}

          {/* Navigation */}
          <div style={{display:"flex",gap:10,marginTop:24}}>
            {step>1&&(
              <button onClick={()=>setStep(s=>s-1)} style={{flex:1,padding:"12px",borderRadius:10,border:"1.5px solid #e5e7eb",background:"transparent",color:"#374151",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                ← Back
              </button>
            )}
            {step<4 ? (
              <button onClick={()=>{if(validate(step))setStep(s=>s+1);}}
                style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${DARK},${GOLD})`,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                Continue →
              </button>
            ) : (
              <button onClick={submit} disabled={loading}
                style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:loading?"rgba(201,168,76,.4)":`linear-gradient(135deg,${DARK},${GOLD})`,color:"#fff",fontWeight:700,fontSize:14,cursor:loading?"not-allowed":"pointer",opacity:loading?.7:1}}>
                {loading?"Creating store… please wait":"🚀 Launch My Store"}
              </button>
            )}
          </div>
        </div>

        <p style={{textAlign:"center",marginTop:16,fontSize:13,color:"#6b7280"}}>
          Already have an account?{" "}
          <Link href="/login" style={{color:GOLD,fontWeight:700,textDecoration:"none"}}>Sign in</Link>
        </p>
      </div>

      <style>{`
        html, body { overflow-x:hidden; -webkit-text-size-adjust:100%; }
        * { box-sizing:border-box; }
        input, textarea, select, button { font-family:inherit; }
        /* 16px minimum stops iOS Safari auto-zooming on focus */
        input, select, textarea { font-size:16px !important; }
        input::placeholder { color:#9ca3af; }
        button, a, label { -webkit-tap-highlight-color:transparent; }
        select { -webkit-appearance:none; appearance:none;
          background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
          background-size:16px; padding-right:38px; }
        @media(max-width:520px) {
          .signup-card { padding:22px 18px !important; }
        }
        @media(max-width:380px) {
          .signup-card { padding:20px 14px !important; }
        }
      `}</style>
    </div>
  );
}

export default function SignupPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{minHeight:"100dvh",display:"flex",alignItems:"center",
        justifyContent:"center",background:"#0f172a"}}>
        <div style={{width:36,height:36,borderRadius:"50%",
          border:"3px solid rgba(201,168,76,.2)",
          borderTopColor:"#c9a84c",
          animation:"spin 1s linear infinite"}}/>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    }>
      <SignupPage/>
    </Suspense>
  );
}
