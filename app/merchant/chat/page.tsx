// app/merchant/chat/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useMerchant } from "../layout";
import { useMerchantChatRoom, useChatMessages, sendMerchantMessage, useMerchantStore } from "@/lib/hooks";
import { db, storage } from "@/lib/firebase/client";
import toast from "react-hot-toast";

// ── Tokens ────────────────────────────────────────────────────
const NAVY = "#0f172a";
const BLUE = "#2563eb";
const GOLD = "#c9a84c";
const C    = { green:"#16a34a", red:"#dc2626", amber:"#d97706", muted:"#64748b", faint:"#94a3b8" };

// ── SVG icons ─────────────────────────────────────────────────
const Ico = ({ d, s=16, c="currentColor" }:{ d:string|string[]; s?:number; c?:string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
  </svg>
);
const I = {
  send:    ["M22 2L11 13","M22 2L15 22l-4-9-9-4 19-7z"],
  attach:  "M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48",
  img:     ["M3 9a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z","M8 13h.01","M12 13a3 3 0 100-4.5"],
  pdf:     ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M9 15h6","M9 18h4"],
  doc:     ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M16 13H8","M16 17H8","M10 9H8"],
  x:       "M18 6L6 18M6 6l12 12",
  check:   "M20 6L9 17l-5-5",
  dcheck:  ["M18 6L9 17l-5-5","M22 6L13 17"],
  headset: ["M3 18v-6a9 9 0 0118 0v6","M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3z","M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"],
  expand:  ["M15 3h6v6","M9 21H3v-6","M21 3l-7 7","M3 21l7-7"],
  chat:    "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  alert:   ["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z","M12 9v4","M12 17h.01"],
  retry:   ["M23 4v6h-6","M20.49 15a9 9 0 11-2.12-9.36L23 10"],
};

const QUICK_REPLIES = [
  "I need help with my order",
  "My store got blocked",
  "I have a payment issue",
  "How do I add products?",
  "Withdrawal not received",
];

// ── Date helpers ──────────────────────────────────────────────
function toDate(ts:any): Date | null {
  if (!ts) return null;
  return ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds*1000) : null);
}
function fmtDay(ts:any): string {
  const d = toDate(ts); if (!d) return "";
  const now  = new Date();
  const diff = Math.floor((now.getTime()-d.getTime())/86400000);
  if (diff===0) return "Today";
  if (diff===1) return "Yesterday";
  if (diff<7)   return d.toLocaleDateString("en-US",{weekday:"long"});
  return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
}
function fmtTime(ts:any): string {
  const d = toDate(ts); if (!d) return "";
  return d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:true});
}
function sameDay(a:any, b:any): boolean {
  const da = toDate(a), db2 = toDate(b);
  if (!da || !db2) return false;
  return da.toDateString() === db2.toDateString();
}

// ── File icon by extension ────────────────────────────────────
function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return I.pdf;
  return I.doc;
}
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

// ── Main ──────────────────────────────────────────────────────
export default function MerchantChatPage() {
  const ctx       = useMerchant();
  const { room }  = useMerchantChatRoom(ctx.uid);
  const { store } = useMerchantStore(ctx.uid);
  const { msgs = [] } = useChatMessages(room?.id ?? null);

  const [text,     setText]     = useState("");
  const [sending,  setSending]  = useState(false);
  const [roomId,   setRoomId]   = useState<string|null>(null);
  const [progress, setProgress] = useState<number|null>(null);
  const [lightbox, setLightbox] = useState<{url:string;name:string}|null>(null);
  const [failed,   setFailed]   = useState<string|null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const isBlocked = store?.status === "blocked";

  useEffect(() => { if (room?.id) setRoomId(room.id); }, [room?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const t = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:"smooth" }), 80);
    return () => clearTimeout(t);
  }, [msgs.length]);

  // ── Clear unread count when merchant opens chat ──
  useEffect(() => {
    if (!room?.id || (room.unreadMerchant ?? 0) === 0) return;
    updateDoc(doc(db,"chat_rooms",room.id), { unreadMerchant: 0 }).catch(() => {});
  }, [room?.id, room?.unreadMerchant]);

  // ── Auto-grow textarea ──
  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }
  useEffect(() => { autoGrow(); }, [text]);

  async function ensureRoom(): Promise<string> {
    if (roomId) return roomId;
    const r = await addDoc(collection(db,"chat_rooms"), {
      merchantId:   ctx.uid,
      merchantName: ctx.name,
      storeName:    ctx.storeName,
      unreadAdmin:  0,
      unreadMerchant: 0,
      lastMessage:  "",
      lastMessageAt: serverTimestamp(),
      createdAt:    serverTimestamp(),
    });
    setRoomId(r.id);
    return r.id;
  }

  async function send(msg?: string) {
    const t = (msg ?? text).trim();
    if (!t || sending) return;
    setText("");
    setFailed(null);
    setSending(true);
    try {
      const rid = await ensureRoom();
      await sendMerchantMessage(rid, t, ctx.uid, ctx.name);
    } catch (e: any) {
      console.error("[chat] send failed:", e);
      setFailed(t);
      setText(t); // restore so they don't lose it
      toast.error("Message failed to send. Tap retry.");
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleFile(file: File) {
    if (file.size > 20*1024*1024) {
      toast.error("File must be under 20MB.");
      return;
    }
    setSending(true);
    setProgress(0);
    try {
      const rid   = await ensureRoom();
      const isImg = file.type.startsWith("image/");
      const path  = `chat-attachments/${rid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const task  = uploadBytesResumable(ref(storage, path), file);

      const url = await new Promise<string>((res, rej) => {
        task.on("state_changed",
          s => setProgress(Math.round((s.bytesTransferred/s.totalBytes)*100)),
          rej,
          async () => res(await getDownloadURL(task.snapshot.ref))
        );
      });
      setProgress(null);

      await addDoc(collection(db,"chat_rooms",rid,"messages"), {
        text:      isImg ? "📷 Sent an image" : `📎 ${file.name}`,
        fileUrl:   url,
        fileName:  file.name,
        fileSize:  file.size,
        fileType:  isImg ? "image" : "document",
        senderId:  ctx.uid,
        senderName:ctx.name,
        senderRole:"merchant",
        read:      false,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db,"chat_rooms",rid), {
        lastMessage:   isImg ? "📷 Image" : `📎 ${file.name}`,
        lastMessageAt: serverTimestamp(),
        unreadAdmin:   (room?.unreadAdmin ?? 0) + 1,
      });
      toast.success(isImg ? "Image sent" : "File sent");
    } catch (e: any) {
      console.error("[chat] upload failed:", e);
      toast.error("Upload failed. Please try again.");
    }
    setSending(false);
    setProgress(null);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const showQuickReplies = msgs.length === 0 && !sending;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100dvh - 56px)", overflow:"hidden", background:"#f0f4f8" }}>

      {/* ── Header ── */}
      <div style={{ padding:"12px 16px", background:"#fff", flexShrink:0, borderBottom:"1px solid #e5e9f5", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:13, flexShrink:0, background:NAVY, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(15,23,42,.22)" }}>
            <Ico d={I.headset} s={20} c={GOLD}/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:15, color:NAVY, marginBottom:2 }}>TargetGlobal Support</div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:C.green, boxShadow:`0 0 5px ${C.green}` }}/>
              <span style={{ fontSize:11, color:C.muted }}>Online · Typically replies in minutes</span>
            </div>
          </div>
          <div className="chat-badge" style={{ background:"rgba(37,99,235,.07)", border:"1px solid rgba(37,99,235,.2)", borderRadius:99, padding:"5px 12px", fontSize:11, color:BLUE, fontWeight:600, display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
            <Ico d={I.chat} s={11} c={BLUE}/>
            Live Chat
          </div>
        </div>
      </div>

      {/* ── Blocked banner ── */}
      {isBlocked && (
        <div style={{ padding:"10px 16px", flexShrink:0, background:"rgba(220,38,38,.07)", borderBottom:"1px solid rgba(220,38,38,.2)", display:"flex", alignItems:"center", gap:10 }}>
          <Ico d={I.alert} s={14} c={C.red}/>
          <p style={{ fontSize:12, color:C.red, fontWeight:600, margin:0, lineHeight:1.5 }}>
            Your store is blocked. Message us below to resolve this.
          </p>
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 14px 8px", display:"flex", flexDirection:"column", gap:2, WebkitOverflowScrolling:"touch" }}>

        {msgs.length === 0 && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px" }}>
            <div style={{ width:64, height:64, borderRadius:20, background:NAVY, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16, boxShadow:"0 8px 24px rgba(15,23,42,.22)" }}>
              <Ico d={I.headset} s={28} c={GOLD}/>
            </div>
            <div style={{ fontWeight:800, fontSize:17, color:NAVY, marginBottom:6 }}>How can we help?</div>
            <div style={{ fontSize:13, color:C.muted, textAlign:"center" as const, lineHeight:1.7, maxWidth:300 }}>
              Send us a message and our team will respond shortly. You can attach screenshots or documents.
            </div>
          </div>
        )}

        {msgs.map((msg:any, idx:number) => {
          const isMe       = msg.senderRole === "merchant";
          const isImg      = msg.fileType === "image";
          const isDoc      = msg.fileType === "document";
          const prevMsg    = msgs[idx-1];
          const showDay    = idx === 0 || !sameDay(prevMsg?.createdAt, msg.createdAt);
          const showAvatar = !isMe && (idx === msgs.length-1 || msgs[idx+1]?.senderRole === "merchant");

          return (
            <div key={msg.id ?? idx}>
              {showDay && (
                <div style={{ display:"flex", alignItems:"center", gap:10, margin:"14px 0 10px" }}>
                  <div style={{ flex:1, height:1, background:"#e5e7eb" }}/>
                  <span style={{ fontSize:11, color:C.faint, fontWeight:500, whiteSpace:"nowrap" as const, padding:"0 4px" }}>
                    {fmtDay(msg.createdAt)}
                  </span>
                  <div style={{ flex:1, height:1, background:"#e5e7eb" }}/>
                </div>
              )}

              <div style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start", alignItems:"flex-end", gap:7, marginBottom:2 }}>
                {!isMe && (
                  <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:NAVY, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 6px rgba(15,23,42,.18)", visibility:showAvatar?"visible":"hidden" }}>
                    <Ico d={I.headset} s={13} c={GOLD}/>
                  </div>
                )}

                <div className="chat-bubble-max" style={{ maxWidth:"75%", minWidth:60, display:"flex", flexDirection:"column", alignItems:isMe?"flex-end":"flex-start" }}>
                  {!isMe && showAvatar && (
                    <div style={{ fontSize:10, color:C.muted, marginBottom:3, paddingLeft:2, fontWeight:600, letterSpacing:".2px" }}>
                      Support Team
                    </div>
                  )}

                  {/* Image */}
                  {isImg && msg.fileUrl && (
                    <div onClick={() => setLightbox({url:msg.fileUrl,name:msg.fileName})}
                      style={{ marginBottom:2, borderRadius:14, overflow:"hidden", cursor:"pointer", maxWidth:240, border:`2px solid ${isMe?"rgba(37,99,235,.3)":"#e5e7eb"}`, boxShadow:isMe?"0 2px 8px rgba(37,99,235,.18)":"0 1px 4px rgba(0,0,0,.07)" }}>
                      <img src={msg.fileUrl} alt={msg.fileName} style={{ width:"100%", display:"block", maxHeight:200, objectFit:"cover" }}/>
                      <div style={{ padding:"6px 10px", background:isMe?`linear-gradient(135deg,#1d4ed8,${BLUE})`:"#fff", display:"flex", alignItems:"center", gap:5, borderTop:`1px solid ${isMe?"rgba(255,255,255,.15)":"#f1f5f9"}` }}>
                        <Ico d={I.expand} s={11} c={isMe?"rgba(255,255,255,.7)":C.faint}/>
                        <span style={{ fontSize:11, color:isMe?"rgba(255,255,255,.7)":C.faint }}>View full image</span>
                      </div>
                    </div>
                  )}

                  {/* Document */}
                  {isDoc && msg.fileUrl && (
                    <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", textDecoration:"none", marginBottom:2, borderRadius:14, borderBottomRightRadius:isMe?3:14, borderBottomLeftRadius:isMe?14:3, background:isMe?`linear-gradient(135deg,#1d4ed8,${BLUE})`:"#fff", border:`1px solid ${isMe?"transparent":"#e5e7eb"}`, boxShadow:isMe?"0 2px 8px rgba(37,99,235,.22)":"0 1px 4px rgba(0,0,0,.06)", maxWidth:250 }}>
                      <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, background:isMe?"rgba(255,255,255,.15)":"rgba(37,99,235,.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Ico d={fileIcon(msg.fileName ?? "")} s={16} c={isMe?"#fff":BLUE}/>
                      </div>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:isMe?"#fff":NAVY, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                          {msg.fileName}
                        </div>
                        <div style={{ fontSize:10, color:isMe?"rgba(255,255,255,.6)":C.faint, marginTop:1 }}>
                          {msg.fileSize ? `${fileSize(msg.fileSize)} · ` : ""}Tap to open ↗
                        </div>
                      </div>
                    </a>
                  )}

                  {/* Text */}
                  {msg.text && !isImg && !isDoc && (
                    <div style={{ padding:"10px 14px", wordBreak:"break-word" as const, fontSize:14, lineHeight:1.6, borderRadius:18, borderBottomRightRadius:isMe?3:18, borderBottomLeftRadius:isMe?18:3, background:isMe?`linear-gradient(135deg,#1d4ed8,${BLUE})`:"#fff", color:isMe?"#fff":"#111827", boxShadow:isMe?"0 2px 8px rgba(37,99,235,.22)":"0 1px 4px rgba(0,0,0,.06)" }}>
                      {msg.text}
                    </div>
                  )}

                  {/* Time + read receipt */}
                  <div style={{ fontSize:10, color:C.faint, marginTop:3, display:"flex", alignItems:"center", gap:3, justifyContent:isMe?"flex-end":"flex-start", paddingLeft:isMe?0:2, paddingRight:isMe?2:0 }}>
                    <span>{fmtTime(msg.createdAt)}</span>
                    {isMe && (
                      <Ico d={msg.read?I.dcheck:I.check} s={11} c={msg.read?BLUE:C.faint}/>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef}/>
      </div>

      {/* ── Failed message retry ── */}
      {failed && (
        <div style={{ padding:"10px 14px", background:"rgba(220,38,38,.06)", borderTop:"1px solid rgba(220,38,38,.2)", flexShrink:0, display:"flex", alignItems:"center", gap:10 }}>
          <Ico d={I.alert} s={14} c={C.red}/>
          <span style={{ flex:1, fontSize:12, color:C.red, fontWeight:500 }}>Message didn't send</span>
          <button type="button" onClick={() => { const t = failed; setFailed(null); send(t); }}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:8, border:`1px solid ${C.red}`, background:"transparent", color:C.red, fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
            <Ico d={I.retry} s={11} c={C.red}/>
            Retry
          </button>
        </div>
      )}

      {/* ── Quick replies ── */}
      {showQuickReplies && (
        <div className="no-sb" style={{ padding:"8px 12px", background:"#fff", borderTop:"1px solid #f1f5f9", flexShrink:0, overflowX:"auto" }}>
          <div style={{ display:"flex", gap:6, paddingBottom:2 }}>
            {QUICK_REPLIES.map(q => (
              <button key={q} type="button" onClick={() => send(q)}
                style={{ padding:"7px 13px", borderRadius:99, flexShrink:0, border:"1.5px solid rgba(37,99,235,.2)", background:"rgba(37,99,235,.04)", color:BLUE, fontSize:12, fontWeight:500, cursor:"pointer", whiteSpace:"nowrap" as const, transition:"all .15s" }}
                onMouseEnter={e => ((e.currentTarget as any).style.background="rgba(37,99,235,.1)")}
                onMouseLeave={e => ((e.currentTarget as any).style.background="rgba(37,99,235,.04)")}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload progress ── */}
      {progress !== null && (
        <div style={{ padding:"8px 16px", background:"#fff", borderTop:"1px solid #e5e9f5", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:BLUE, fontWeight:600, marginBottom:5 }}>
            <span>Uploading…</span><span>{progress}%</span>
          </div>
          <div style={{ height:3, background:"#e5e9f5", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${progress}%`, background:`linear-gradient(90deg,#1d4ed8,${BLUE})`, borderRadius:99, transition:"width .2s" }}/>
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <div style={{ flexShrink:0, background:"#fff", borderTop:"1px solid #e5e9f5", padding:"10px 12px", paddingBottom:"max(12px,env(safe-area-inset-bottom))", display:"flex", gap:8, alignItems:"flex-end", boxShadow:"0 -2px 10px rgba(0,0,0,.04)" }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={sending}
          aria-label="Attach file"
          style={{ width:44, height:44, borderRadius:11, border:"1.5px solid #e5e9f5", background:"#f9fafb", color:C.muted, cursor:sending?"not-allowed":"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s", opacity:sending?.5:1 }}
          onMouseEnter={e => { if(!sending){ (e.currentTarget as any).style.borderColor=BLUE; (e.currentTarget as any).style.color=BLUE; }}}
          onMouseLeave={e => { (e.currentTarget as any).style.borderColor="#e5e9f5"; (e.currentTarget as any).style.color=C.muted; }}>
          <Ico d={I.attach} s={17}/>
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" style={{ display:"none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value=""; }}/>

        <textarea ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message…"
          rows={1}
          style={{ flex:1, background:"#f4f6fb", border:"1.5px solid #e5e9f5", borderRadius:14, padding:"11px 14px", color:"#111827", fontSize:16, outline:"none", resize:"none" as const, lineHeight:1.45, maxHeight:120, minHeight:44, fontFamily:"inherit", overflowY:"auto", WebkitAppearance:"none" as const, transition:"border .15s" }}
          onFocus={e => { e.target.style.borderColor=BLUE; setTimeout(() => bottomRef.current?.scrollIntoView({behavior:"smooth",block:"end"}), 350); }}
          onBlur={e  => (e.target.style.borderColor="#e5e9f5")}/>

        <button type="button" onClick={() => send()} disabled={!text.trim() || sending}
          aria-label="Send message"
          style={{ width:44, height:44, borderRadius:12, border:"none", background:text.trim()&&!sending?`linear-gradient(135deg,#1d4ed8,${BLUE})`:"#e5e9f5", color:text.trim()&&!sending?"#fff":"#9ca3af", cursor:text.trim()&&!sending?"pointer":"default", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s", WebkitTapHighlightColor:"transparent", boxShadow:text.trim()&&!sending?"0 4px 12px rgba(37,99,235,.28)":"none" }}>
          {sending
            ? <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(255,255,255,.4)", borderTopColor:"#fff", display:"inline-block", animation:"spin 1s linear infinite" }}/>
            : <Ico d={I.send} s={16} c={text.trim()?"#fff":"#9ca3af"}/>}
        </button>
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <>
          <div onClick={() => setLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.9)", zIndex:400, backdropFilter:"blur(6px)" }}/>
          <div style={{ position:"fixed", top:"50%", left:"50%", zIndex:401, transform:"translate(-50%,-50%)", width:"min(94vw,560px)", maxHeight:"88dvh", display:"flex", flexDirection:"column", background:"#fff", borderRadius:20, overflow:"hidden", boxShadow:"0 32px 64px rgba(0,0,0,.4)" }}>
            <div style={{ padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #e5e9f5", flexShrink:0 }}>
              <div style={{ fontWeight:600, fontSize:13, color:NAVY, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, flex:1 }}>
                {lightbox.name}
              </div>
              <button type="button" onClick={() => setLightbox(null)}
                style={{ width:30, height:30, borderRadius:8, background:"#f3f4f6", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, flexShrink:0, marginLeft:10 }}>
                <Ico d={I.x} s={14}/>
              </button>
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              <img src={lightbox.url} alt={lightbox.name} style={{ width:"100%", display:"block", objectFit:"contain" }}/>
            </div>
            <div style={{ padding:"10px 14px", borderTop:"1px solid #e5e9f5", display:"flex", gap:10, flexShrink:0 }}>
              <a href={lightbox.url} target="_blank" rel="noopener noreferrer"
                style={{ flex:1, padding:"11px", borderRadius:10, background:NAVY, color:GOLD, fontWeight:700, fontSize:13, textDecoration:"none", textAlign:"center" as const, display:"block" }}>
                Open Full Size ↗
              </a>
              <button type="button" onClick={() => setLightbox(null)}
                style={{ padding:"11px 18px", borderRadius:10, border:"1px solid #e5e9f5", background:"transparent", color:C.muted, fontWeight:600, fontSize:13, cursor:"pointer" }}>
                Close
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        .no-sb::-webkit-scrollbar { display:none } .no-sb { scrollbar-width:none }

        /* 16px minimum stops iOS Safari auto-zooming on focus */
        textarea, input, select { font-size:16px !important; }
        textarea::placeholder { color:#9ca3af; }

        /* Kill horizontal scroll + tap flash */
        html, body { overflow-x:hidden; -webkit-text-size-adjust:100%; }
        button, a, textarea { -webkit-tap-highlight-color:transparent; }

        /* Images never break the bubble width */
        img { max-width:100%; }

        @media(max-width:380px) { .chat-badge { display:none!important } }
        @media(max-width:420px) {
          .chat-bubble-max { max-width:86%!important }
        }
        @media(max-width:360px) {
          .chat-bubble-max { max-width:90%!important }
        }
      `}</style>
    </div>
  );
}
