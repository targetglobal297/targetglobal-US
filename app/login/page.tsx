// app/login/page.tsx — Clean merchant login, authentic design
"use client";
import { useState } from "react";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase/client";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (!snap.exists() || snap.data().role !== "merchant") {
        await auth.signOut();
        toast.error("No merchant account found. Please sign up.");
        setLoading(false); return;
      }
      await updateDoc(doc(db, "users", cred.user.uid), { lastLogin: serverTimestamp() });
      toast.success("Welcome back!");
      router.push("/merchant/dashboard");
    } catch (err: any) {
      const msg = err.code === "auth/invalid-credential" || err.code === "auth/wrong-password"
        ? "Incorrect email or password."
        : err.code === "auth/user-not-found"
        ? "No account found with this email. Would you like to sign up?"
        : err.code === "auth/too-many-requests"
        ? "Too many failed attempts. Please wait a few minutes and try again."
        : "Sign in failed. Please check your connection and try again.";
      toast.error(msg);
      setLoading(false);
    }
  }

  const C = { blue:"#c9a84c", violet:"#0a0a0a" };

  return (
    <div style={{
      minHeight:"100dvh", display:"flex",
      fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",
    }}>
      {/* Left — branding panel (hidden on mobile) */}
      <div style={{
        flex:1, background:"linear-gradient(160deg,#0a0a0a 0%,#1a1400 50%,#0a0a0a 100%)",
        display:"flex", flexDirection:"column", justifyContent:"space-between",
        padding:"48px 52px", position:"relative", overflow:"hidden",
      }} id="login-left">
        {/* Background image */}
        <div style={{
          position:"absolute", inset:0,
          backgroundImage:"url(https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80)",
          backgroundSize:"cover", backgroundPosition:"center", opacity:.1,
        }}/>
        <div style={{ position:"relative" }}>
          {/* Logo — centered */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:64 }}>
            <img src="/logo-white.png" alt="TargetGlobal" style={{height:52,width:"auto"}}/>
          </div>
          <h1 style={{ fontWeight:900, fontSize:"clamp(28px,3vw,42px)", color:"#fff", letterSpacing:"-1px", lineHeight:1.1, marginBottom:16 }}>
            Sell globally.<br/>Earn Your Way.
          </h1>
          <p style={{ fontSize:16, color:"rgba(255,255,255,.6)", lineHeight:1.7, maxWidth:380 }}>
            Join thousands of merchants selling premium products worldwide. No inventory. Bank transfer, mobile money, and crypto payouts available.
          </p>
        </div>
        {/* Stats */}
        <div style={{ position:"relative", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
          {[{v:"10K+",l:"Merchants"},{v:"$2.4M",l:"Paid Out"},{v:"50+",l:"Countries"}].map(s=>(
            <div key={s.l}>
              <div style={{ fontWeight:900, fontSize:28, color:"#fff", letterSpacing:"-1px" }}>{s.v}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — login form */}
      <div style={{
        width:"100%", maxWidth:480, display:"flex", flexDirection:"column",
        justifyContent:"center", padding:"48px 40px", background:"#fff",
        overflowY:"auto",
      }}>
        {/* Mobile logo */}
        <div style={{ display:"none", justifyContent:"center", marginBottom:36 }} id="mobile-logo">
          <img src="/logo-icon.png" alt="TargetGlobal" style={{height:68,width:"auto"}}/>
        </div>

        <div style={{ marginBottom:36 }}>
          <h2 style={{ fontWeight:900, fontSize:28, color:"#111827", letterSpacing:"-.5px", marginBottom:8 }}>Welcome back</h2>
          <p style={{ color:"#6b7280", fontSize:15 }}>
            Sign in to your merchant dashboard.
          </p>
        </div>

        <form onSubmit={handle}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:13, fontWeight:600, color:"#374151", marginBottom:6 }}>
              Email address
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb", borderRadius:12, fontSize:16, outline:"none", color:"#111827", background:"#fff", transition:"border .2s", boxSizing:"border-box" as const }}
              onFocus={e => (e.target.style.borderColor = C.blue)}
              onBlur={e  => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <label style={{ fontSize:13, fontWeight:600, color:"#374151" }}>Password</label>
              <Link href="/forgot-password" style={{ fontSize:12, color:C.blue, textDecoration:"none", fontWeight:600 }}>Forgot password?</Link>
            </div>
            <div style={{ position:"relative" }}>
              <input
                type={showPw ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password" required
                style={{ width:"100%", padding:"13px 46px 13px 16px", border:"1.5px solid #e5e7eb", borderRadius:12, fontSize:16, outline:"none", color:"#111827", background:"#fff", transition:"border .2s", boxSizing:"border-box" as const }}
                onFocus={e => (e.target.style.borderColor = C.blue)}
                onBlur={e  => (e.target.style.borderColor = "#e5e7eb")}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:18, padding:0 }}>
                {showPw ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            width:"100%", padding:"14px", borderRadius:12, border:"none",
            background: loading ? "rgba(201,168,76,.4)" : `linear-gradient(135deg,${C.blue},${C.violet})`,
            color:"#fff", fontWeight:700, fontSize:15,
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading ? "none" : "0 4px 20px rgba(201,168,76,.35)",
            transition:"all .2s", marginTop:20, marginBottom:20,
          }}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <div style={{ flex:1, height:1, background:"#e5e7eb" }}/>
          <span style={{ fontSize:12, color:"#9ca3af", fontWeight:500 }}>New to TargetGlobal?</span>
          <div style={{ flex:1, height:1, background:"#e5e7eb" }}/>
        </div>

        <Link href="/signup" style={{
          display:"block", width:"100%", padding:"13px", borderRadius:12,
          border:"2px solid #e5e7eb", textAlign:"center",
          color:"#374151", fontWeight:700, fontSize:15, textDecoration:"none",
          transition:"all .2s",
        }}>
          Create a free store →
        </Link>

        <p style={{ textAlign:"center", marginTop:24, fontSize:12, color:"#9ca3af", lineHeight:1.6 }}>
          By signing in you agree to our{" "}
          <a href="#" style={{ color:C.blue, textDecoration:"none" }}>Terms of Service</a>{" "}and{" "}
          <a href="#" style={{ color:C.blue, textDecoration:"none" }}>Privacy Policy</a>.
        </p>
      </div>

      <style>{`
        html, body { overflow-x:hidden; -webkit-text-size-adjust:100%; }
        * { box-sizing:border-box; }
        input, textarea, select, button { font-family:inherit; }
        /* 16px minimum stops iOS Safari auto-zooming on focus */
        input, select, textarea { font-size:16px !important; }
        input::placeholder { color:#9ca3af; }
        button, a { -webkit-tap-highlight-color:transparent; }

        @media(min-width:768px) { #mobile-logo{display:none!important} }
        @media(max-width:767px) {
          #login-left{display:none!important}
          div[style*="maxWidth:480"]{max-width:100%!important;padding:28px 20px!important}
          #mobile-logo{display:flex!important}
        }
        @media(max-width:380px) {
          div[style*="maxWidth:480"]{padding:24px 16px!important}
        }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
