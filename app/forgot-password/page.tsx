// app/forgot-password/page.tsx — matches login page design
"use client";
import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const C = { blue:"#c9a84c", violet:"#0a0a0a", green:"#16a34a" };

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!mail) { toast.error("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { toast.error("That email address doesn't look right."); return; }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, mail, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
      setSent(true);
      toast.success("Reset link sent!");
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/user-not-found") {
        setSent(true); // don't reveal whether the account exists
      } else if (code === "auth/invalid-email") {
        toast.error("That email address doesn't look right.");
      } else if (code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please wait a few minutes.");
      } else if (code === "auth/unauthorized-continue-uri") {
        toast.error("Configuration error. Please contact support.");
        console.error("[forgot-password] Add this domain to Firebase → Auth → Settings → Authorized domains:", window.location.origin);
      } else {
        toast.error("Couldn't send the reset email. Please try again.");
        console.error("[forgot-password]", code, err?.message);
      }
      setLoading(false);
    }
  }

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
      }} id="fp-left">
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
            Locked out?<br/>We've got you.
          </h1>
          <p style={{ fontSize:16, color:"rgba(255,255,255,.6)", lineHeight:1.7, maxWidth:380 }}>
            Reset your password in seconds and get straight back to running your store. Your products, orders and wallet are all safe.
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

      {/* Right — form */}
      <div style={{
        width:"100%", maxWidth:480, display:"flex", flexDirection:"column",
        justifyContent:"center", padding:"48px 40px", background:"#fff",
        overflowY:"auto",
      }} id="fp-right">
        {/* Mobile logo */}
        <div style={{ display:"none", justifyContent:"center", marginBottom:36 }} id="fp-mobile-logo">
          <img src="/logo-icon.png" alt="TargetGlobal" style={{height:68,width:"auto"}}/>
        </div>

        {sent ? (
          /* ── Success state ── */
          <>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{
                width:72, height:72, borderRadius:20, margin:"0 auto 20px",
                background:"rgba(22,163,74,.08)", border:"2px solid rgba(22,163,74,.2)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <path d="M22 6l-10 7L2 6"/>
                </svg>
              </div>
              <h2 style={{ fontWeight:900, fontSize:28, color:"#111827", letterSpacing:"-.5px", marginBottom:10 }}>
                Check your inbox
              </h2>
              <p style={{ color:"#6b7280", fontSize:15, lineHeight:1.7, marginBottom:4 }}>
                If an account exists for
              </p>
              <p style={{ color:C.blue, fontSize:15, fontWeight:700, wordBreak:"break-all", marginBottom:10 }}>
                {email.trim().toLowerCase()}
              </p>
              <p style={{ color:"#6b7280", fontSize:14, lineHeight:1.7 }}>
                we've sent a reset link. It expires in 1 hour.
              </p>
            </div>

            {/* Tips */}
            <div style={{
              background:"#fafafa", border:"1.5px solid #e5e7eb", borderRadius:12,
              padding:"16px 18px", marginBottom:24,
            }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:12, textTransform:"uppercase" as const, letterSpacing:".5px" }}>
                Didn't receive it?
              </div>
              {[
                "Check your spam or junk folder",
                "Make sure the email address is correct",
                "Wait 2–3 minutes — delivery can be slow",
              ].map((t,i) => (
                <div key={i} style={{ display:"flex", gap:9, marginBottom:i<2?9:0, alignItems:"flex-start" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:C.blue, marginTop:7, flexShrink:0 }}/>
                  <span style={{ fontSize:13.5, color:"#6b7280", lineHeight:1.6 }}>{t}</span>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => { setSent(false); setLoading(false); }}
              style={{
                width:"100%", padding:"13px", borderRadius:12,
                border:"2px solid #e5e7eb", background:"transparent",
                color:"#374151", fontWeight:700, fontSize:15,
                cursor:"pointer", marginBottom:12, transition:"all .2s",
              }}>
              Try a different email
            </button>

            <Link href="/login" style={{
              display:"block", width:"100%", padding:"14px", borderRadius:12,
              background:`linear-gradient(135deg,${C.blue},${C.violet})`,
              color:"#fff", fontWeight:700, fontSize:15, textDecoration:"none",
              textAlign:"center", boxShadow:"0 4px 20px rgba(201,168,76,.35)",
            }}>
              Back to Sign In →
            </Link>
          </>
        ) : (
          /* ── Form state ── */
          <>
            <div style={{ marginBottom:36 }}>
              <Link href="/login" style={{
                display:"inline-flex", alignItems:"center", gap:6, marginBottom:20,
                fontSize:13, color:"#6b7280", textDecoration:"none", fontWeight:600,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back to sign in
              </Link>
              <h2 style={{ fontWeight:900, fontSize:28, color:"#111827", letterSpacing:"-.5px", marginBottom:8 }}>
                Reset password
              </h2>
              <p style={{ color:"#6b7280", fontSize:15, lineHeight:1.6 }}>
                Enter your email and we'll send you a link to create a new password.
              </p>
            </div>

            <form onSubmit={handle}>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:600, color:"#374151", marginBottom:6 }}>
                  Email address
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus autoComplete="email"
                  style={{ width:"100%", padding:"13px 16px", border:"1.5px solid #e5e7eb", borderRadius:12, fontSize:16, outline:"none", color:"#111827", background:"#fff", transition:"border .2s", boxSizing:"border-box" as const }}
                  onFocus={e => (e.target.style.borderColor = C.blue)}
                  onBlur={e  => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>

              <button type="submit" disabled={loading} style={{
                width:"100%", padding:"14px", borderRadius:12, border:"none",
                background: loading ? "rgba(201,168,76,.4)" : `linear-gradient(135deg,${C.blue},${C.violet})`,
                color:"#fff", fontWeight:700, fontSize:15,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 20px rgba(201,168,76,.35)",
                transition:"all .2s", marginBottom:20,
              }}>
                {loading ? "Sending…" : "Send Reset Link →"}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ flex:1, height:1, background:"#e5e7eb" }}/>
              <span style={{ fontSize:12, color:"#9ca3af", fontWeight:500 }}>Remember it?</span>
              <div style={{ flex:1, height:1, background:"#e5e7eb" }}/>
            </div>

            <Link href="/login" style={{
              display:"block", width:"100%", padding:"13px", borderRadius:12,
              border:"2px solid #e5e7eb", textAlign:"center",
              color:"#374151", fontWeight:700, fontSize:15, textDecoration:"none",
              transition:"all .2s",
            }}>
              Sign in instead
            </Link>

            <p style={{ textAlign:"center", marginTop:24, fontSize:12, color:"#9ca3af", lineHeight:1.6 }}>
              Still locked out?{" "}
              <a href="mailto:support@targetglobal.org" style={{ color:C.blue, textDecoration:"none" }}>
                Contact support
              </a>
            </p>
          </>
        )}
      </div>

      <style>{`
        html, body { overflow-x:hidden; -webkit-text-size-adjust:100%; }
        * { box-sizing:border-box; }
        input, textarea, select, button { font-family:inherit; }
        /* 16px minimum stops iOS Safari auto-zooming on focus */
        input, select, textarea { font-size:16px !important; }
        input::placeholder { color:#9ca3af; }
        button, a { -webkit-tap-highlight-color:transparent; }

        @media(min-width:768px) { #fp-mobile-logo{display:none!important} }
        @media(max-width:767px) {
          #fp-left{display:none!important}
          #fp-right{max-width:100%!important;padding:28px 20px!important}
          #fp-mobile-logo{display:flex!important}
        }
        @media(max-width:380px) {
          #fp-right{padding:24px 16px!important}
        }
      `}</style>
    </div>
  );
}
