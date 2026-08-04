// app/merchant/products/page.tsx
// Ecommerce-grade design — add only, admin manages visibility/removal
"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useMerchant } from "../layout";
import { useStoreProducts, useCatalog, addProductToStore } from "@/lib/hooks";
import toast from "react-hot-toast";

// ── Tokens ────────────────────────────────────────────────────
const NAVY = "#0f172a";
const BLUE = "#2563eb";
const GOLD = "#c9a84c";
const C    = { green:"#16a34a", red:"#dc2626", amber:"#d97706", muted:"#64748b" };

const CATS = [
  "All","Electronics","Women's Shoes","Men's Shoes",
  "Women's Clothing","Men's Clothing","Bags","Fitness",
  "Kitchen & Home","Kids & Baby","Beauty","General",
];

// ── SVG ───────────────────────────────────────────────────────
const Ico = ({ d, s=16, c="currentColor" }:{ d:string|string[]; s?:number; c?:string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
  </svg>
);
const IC = {
  search: ["M11 19a8 8 0 100-16 8 8 0 000 16z","M21 21l-4.35-4.35"],
  x:      "M18 6L6 18M6 6l12 12",
  plus:   "M12 5v14M5 12h14",
  check:  "M20 6L9 17l-5-5",
  chevL:  "M15 18l-6-6 6-6",
  chevR:  "M9 18l6-6-6-6",
  pkg:    ["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"],
  expand: ["M15 3h6v6","M9 21H3v-6","M21 3l-7 7","M3 21l7-7"],
  store:  ["M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z","M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9","M12 3v6"],
  info:   ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 8h.01","M12 12v4"],
  chat:   "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
};

// ── Helpers ───────────────────────────────────────────────────
function getImgs(p:any): string[] {
  const imgs = (p.images||[]).filter((i:string)=>i?.startsWith("http"));
  if (!imgs.length && p.productImage?.startsWith("http")) return [p.productImage];
  return imgs;
}
function getImg(p:any): string|null { return getImgs(p)[0]??null; }
function calcProfit(p:any, variant?:any): number {
  const retail = variant?.retailPrice??p.suggestedRetail??p.retailPrice??0;
  const cost   = variant?.basePrice??p.basePrice??0;
  return +(retail-cost).toFixed(2);
}

// ── Fullscreen lightbox ───────────────────────────────────────
function Lightbox({ images, startIdx, onClose }:{
  images:string[]; startIdx:number; onClose:()=>void;
}) {
  const [idx,setIdx] = useState(startIdx);
  const go = (d:number) => setIdx(i=>(i+d+images.length)%images.length);

  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{
      if(e.key==="Escape") onClose();
      if(e.key==="ArrowLeft") go(-1);
      if(e.key==="ArrowRight") go(1);
    };
    document.addEventListener("keydown",fn);
    return()=>document.removeEventListener("keydown",fn);
  },[]);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:600,
      background:"rgba(0,0,0,.96)",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center"}}>
      {/* Close */}
      <button onClick={onClose} aria-label="Close lightbox"
        style={{position:"absolute",top:16,right:16,width:40,height:40,
          borderRadius:"50%",border:"1px solid rgba(255,255,255,.2)",
          background:"rgba(255,255,255,.1)",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>
        <Ico d={IC.x} s={16}/>
      </button>
      {/* Counter */}
      <div style={{position:"absolute",top:20,left:"50%",transform:"translateX(-50%)",
        fontSize:11,color:"rgba(255,255,255,.5)",fontFamily:"monospace",
        background:"rgba(0,0,0,.5)",padding:"3px 10px",borderRadius:99}}>
        {idx+1} / {images.length}
      </div>
      {/* Image */}
      <div style={{flex:1,width:"100%",display:"flex",alignItems:"center",
        justifyContent:"center",padding:"56px 72px"}}
        onClick={e=>e.stopPropagation()}>
        <img src={images[idx]} alt=""
          style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}}/>
      </div>
      {/* Arrows */}
      {images.length>1&&[-1,1].map(d=>(
        <button key={d} onClick={e=>{e.stopPropagation();go(d);}}
          aria-label={d===-1?"Previous image":"Next image"}
          style={{position:"absolute",top:"50%",transform:"translateY(-50%)",
            [d===-1?"left":"right"]:12,width:44,height:44,borderRadius:"50%",
            border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>
          <Ico d={d===-1?IC.chevL:IC.chevR} s={20}/>
        </button>
      ))}
      {/* Thumbnail strip */}
      {images.length>1&&(
        <div style={{flexShrink:0,display:"flex",gap:6,padding:"12px 16px",
          overflowX:"auto",maxWidth:"100%",scrollbarWidth:"none" as any}}>
          {images.map((img,i)=>(
            <div key={i} onClick={e=>{e.stopPropagation();setIdx(i);}}
              style={{width:i===idx?44:30,height:30,borderRadius:5,overflow:"hidden",
                cursor:"pointer",transition:"all .2s",flexShrink:0,
                border:`2px solid ${i===idx?"#fff":"rgba(255,255,255,.2)"}`,
                opacity:i===idx?1:.5}}>
              <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Image carousel ────────────────────────────────────────────
function Carousel({ images, name, onExpand }:{
  images:string[]; name:string; onExpand:(i:number)=>void;
}) {
  const [idx,   setIdx]   = useState(0);
  const [drag,  setDrag]  = useState<number|null>(null);
  const go = useCallback((i:number)=>setIdx((i+images.length)%images.length),[images.length]);

  if (!images.length) return (
    <div style={{width:"100%",height:"100%",background:"#f1f5f9",
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <Ico d={IC.pkg} s={44} c="#cbd5e1"/>
    </div>
  );

  return (
    <div style={{position:"relative",width:"100%",height:"100%",userSelect:"none"}}
      onMouseDown={e=>setDrag(e.clientX)}
      onMouseUp={e=>{if(drag!==null){const d=e.clientX-drag;if(Math.abs(d)>40)go(d<0?idx+1:idx-1);setDrag(null);}}}
      onTouchStart={e=>setDrag(e.touches[0].clientX)}
      onTouchEnd={e=>{if(drag!==null){const d=e.changedTouches[0].clientX-drag;if(Math.abs(d)>40)go(d<0?idx+1:idx-1);setDrag(null);}}}>

      <img src={images[idx]} alt={name}
        style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
        onError={e=>((e.currentTarget as any).style.opacity="0")}/>

      {/* Top bar: CLOSE LEFT, EXPAND RIGHT — no overlap */}
      <div style={{position:"absolute",top:0,left:0,right:0,
        display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"10px 12px",
        background:"linear-gradient(to bottom,rgba(0,0,0,.4) 0%,transparent 100%)",
        zIndex:3}}>
        {/* Close — left */}
        <button
          onClick={e=>{e.stopPropagation();(window as any).__closeProductModal?.();}}
          aria-label="Close"
          style={{width:34,height:34,borderRadius:"50%",
            border:"1px solid rgba(255,255,255,.3)",background:"rgba(0,0,0,.45)",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",backdropFilter:"blur(4px)"}}>
          <Ico d={IC.x} s={14}/>
        </button>
        {/* Expand — right */}
        <button onClick={e=>{e.stopPropagation();onExpand(idx);}}
          aria-label="View fullscreen"
          style={{width:34,height:34,borderRadius:"50%",
            border:"1px solid rgba(255,255,255,.3)",background:"rgba(0,0,0,.45)",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",backdropFilter:"blur(4px)"}}>
          <Ico d={IC.expand} s={13}/>
        </button>
      </div>

      {/* Bottom: thumbnails + counter */}
      {images.length>1&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,
          padding:"8px 12px",
          background:"linear-gradient(transparent,rgba(0,0,0,.55))",
          display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:3}}>
          {/* Thumbnails */}
          <div style={{display:"flex",gap:4}}>
            {images.slice(0,5).map((img,i)=>(
              <div key={i} onClick={e=>{e.stopPropagation();setIdx(i);}}
                style={{width:i===idx?36:24,height:24,borderRadius:4,overflow:"hidden",
                  border:`2px solid ${i===idx?"#fff":"rgba(255,255,255,.3)"}`,
                  cursor:"pointer",transition:"all .2s",flexShrink:0,opacity:i===idx?1:.6}}>
                <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </div>
            ))}
          </div>
          {/* Counter */}
          <div style={{fontSize:10,color:"rgba(255,255,255,.7)",fontFamily:"monospace",
            background:"rgba(0,0,0,.45)",padding:"2px 8px",borderRadius:99}}>
            {idx+1}/{images.length}
          </div>
        </div>
      )}

      {/* Side arrows */}
      {images.length>1&&[-1,1].map(d=>(
        <button key={d} onClick={e=>{e.stopPropagation();go(idx+d);}}
          style={{position:"absolute",top:"50%",transform:"translateY(-50%)",
            [d===-1?"left":"right"]:8,width:30,height:30,borderRadius:"50%",
            border:"none",background:"rgba(0,0,0,.45)",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",zIndex:3,backdropFilter:"blur(4px)"}}>
          <Ico d={d===-1?IC.chevL:IC.chevR} s={14}/>
        </button>
      ))}
    </div>
  );
}

// ── Product modal ─────────────────────────────────────────────
function ProductModal({ p, inStore, onAdd, onClose, acting }:{
  p:any; inStore:boolean; onAdd:()=>void; onClose:()=>void; acting:boolean;
}) {
  const imgs    = getImgs(p);
  const [lightbox, setLightbox] = useState<number|null>(null);
  const [selSize,  setSelSize]  = useState<string|null>(null);
  const [selColor, setSelColor] = useState<string|null>(null);

  // Expose close fn for carousel button
  useEffect(()=>{
    (window as any).__closeProductModal = onClose;
    return()=>{ delete (window as any).__closeProductModal; };
  },[onClose]);

  const sizes   = [...new Set((p.variants||[]).map((v:any)=>v.size).filter((s:any)=>s&&s!=="One Size"&&s!=="one size"))] as string[];
  const oneSize = (p.variants||[]).some((v:any)=>v.size==="One Size"||v.size==="one size");
  const colors  = [...new Set((p.variants||[]).map((v:any)=>v.color).filter(Boolean))] as string[];
  const selVar  = p.variants?.find((v:any)=>
    (!sizes.length||v.size===selSize||oneSize)&&(!colors.length||v.color===selColor)
  )??p.variants?.[0];

  const retail  = selVar?.retailPrice??p.suggestedRetail??p.retailPrice??0;
  const cost    = selVar?.basePrice??p.basePrice??0;
  const profit  = +(retail-cost).toFixed(2);
  const stock   = selVar?.stock??p.stock??0;
  const totalStock = p.variants?.reduce((a:number,v:any)=>a+(v.stock??0),0)??stock;

  useEffect(()=>{
    if(sizes.length)  setSelSize(sizes[0]);
    if(colors.length) setSelColor(colors[0]);
  },[p.id]);

  return (
    <>
      {lightbox!==null&&(
        <Lightbox images={imgs} startIdx={lightbox} onClose={()=>setLightbox(null)}/>
      )}

      {/* Backdrop */}
      <div onClick={onClose} style={{position:"fixed",inset:0,
        background:"rgba(0,0,0,.65)",zIndex:200,backdropFilter:"blur(8px)"}}/>

      {/* Sheet */}
      <div onClick={e=>e.stopPropagation()}
        style={{position:"fixed",bottom:0,left:0,right:0,zIndex:201,
          background:"#fff",borderRadius:"24px 24px 0 0",
          maxHeight:"94dvh",display:"flex",flexDirection:"column",
          boxShadow:"0 -20px 60px rgba(0,0,0,.25)",
          animation:"sheetUp .28s cubic-bezier(.34,1.1,.64,1)"}}>

        {/* Image area — 290px fixed height */}
        <div style={{height:290,flexShrink:0,background:"#f1f5f9",
          borderRadius:"24px 24px 0 0",overflow:"hidden"}}>
          <Carousel images={imgs} name={p.name} onExpand={i=>setLightbox(i)}/>
        </div>

        {/* In-store chip overlay — shown when already added */}
        {inStore&&(
          <div style={{position:"absolute",top:248,left:"50%",
            transform:"translateX(-50%)",zIndex:5,
            display:"flex",alignItems:"center",gap:5,
            background:"rgba(37,99,235,.95)",backdropFilter:"blur(4px)",
            borderRadius:99,padding:"5px 13px",
            boxShadow:"0 2px 10px rgba(37,99,235,.35)"}}>
            <Ico d={IC.check} s={11} c="#fff"/>
            <span style={{fontSize:10,fontWeight:700,color:"#fff",letterSpacing:".5px"}}>
              IN STORE
            </span>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          <div style={{padding:"20px 20px 0"}}>

            {/* Category + vendor */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:10,fontWeight:700,color:BLUE,
                background:"rgba(37,99,235,.08)",padding:"3px 9px",
                borderRadius:99,letterSpacing:".5px",textTransform:"uppercase"}}>
                {p.category}
              </span>
              <span style={{fontSize:11,color:"#94a3b8"}}>by {p.vendorName}</span>
            </div>

            {/* Name + price inline */}
            <div style={{display:"flex",alignItems:"flex-start",
              justifyContent:"space-between",gap:12,marginBottom:16}}>
              <h2 style={{fontWeight:800,fontSize:20,color:NAVY,
                lineHeight:1.2,letterSpacing:"-.4px",margin:0,flex:1}}>
                {p.name}
              </h2>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"monospace",fontWeight:900,
                  fontSize:22,color:NAVY,lineHeight:1}}>
                  ${retail.toFixed(2)}
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>retail price</div>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="price-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
              gap:7,marginBottom:16}}>
              {[
                {l:"You pay",   v:`$${cost.toFixed(2)}`,    c:"#374151", bg:"#f8fafc",             bd:"#e5e7eb"},
                {l:"Retail",    v:`$${retail.toFixed(2)}`,  c:NAVY,      bg:"#f8fafc",             bd:"#e5e7eb"},
                {l:"Profit",    v:`+$${profit.toFixed(2)}`, c:C.green,   bg:"rgba(22,163,74,.05)", bd:"rgba(22,163,74,.2)"},
              ].map(s=>(
                <div key={s.l} style={{padding:"10px",borderRadius:10,
                  background:s.bg,border:`1px solid ${s.bd}`,textAlign:"center"}}>
                  <div style={{fontSize:8,color:s.l==="Profit"?C.green:"#94a3b8",fontWeight:700,
                    textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>{s.l}</div>
                  <div style={{fontFamily:"monospace",fontWeight:800,fontSize:14,color:s.c}}>
                    {s.v}
                  </div>
                </div>
              ))}
            </div>

            {/* Stock status */}
            <div style={{display:"inline-flex",alignItems:"center",gap:6,
              marginBottom:16,padding:"5px 12px",borderRadius:99,
              background:totalStock>10?"rgba(22,163,74,.06)":totalStock>0?"rgba(217,119,6,.06)":"rgba(220,38,38,.06)",
              border:`1px solid ${totalStock>10?"rgba(22,163,74,.2)":totalStock>0?"rgba(217,119,6,.2)":"rgba(220,38,38,.2)"}`}}>
              <div style={{width:6,height:6,borderRadius:"50%",
                background:totalStock>10?C.green:totalStock>0?C.amber:C.red}}/>
              <span style={{fontSize:12,fontWeight:600,
                color:totalStock>10?C.green:totalStock>0?C.amber:C.red}}>
                {totalStock>10?`${totalStock} in stock`:totalStock>0?`Only ${totalStock} left`:"Out of stock"}
              </span>
            </div>

            {/* Sizes */}
            {(sizes.length>0||oneSize)&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>
                  Size {selSize&&<span style={{color:NAVY,fontWeight:800,textTransform:"none"}}>— {selSize}</span>}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {oneSize&&(
                    <button onClick={()=>setSelSize("One Size")}
                      style={{padding:"7px 13px",borderRadius:8,fontSize:13,cursor:"pointer",
                        border:`1.5px solid ${selSize==="One Size"?NAVY:"#e5e7eb"}`,
                        background:selSize==="One Size"?NAVY:"#f8fafc",
                        color:selSize==="One Size"?"#fff":"#374151",
                        fontWeight:selSize==="One Size"?700:500,transition:"all .15s"}}>
                      One Size
                    </button>
                  )}
                  {sizes.map(sz=>{
                    const has=(p.variants||[]).some((v:any)=>v.size===sz&&v.stock>0);
                    return (
                      <button key={sz} onClick={()=>has&&setSelSize(sz)} disabled={!has}
                        style={{padding:"7px 13px",borderRadius:8,fontSize:13,cursor:has?"pointer":"not-allowed",
                          border:`1.5px solid ${selSize===sz?NAVY:"#e5e7eb"}`,
                          background:selSize===sz?NAVY:"#f8fafc",
                          color:selSize===sz?"#fff":has?"#374151":"#c4c4c4",
                          fontWeight:selSize===sz?700:500,
                          textDecoration:has?"none":"line-through",
                          opacity:has?1:.45,transition:"all .15s"}}>
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Colors */}
            {colors.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>
                  Color {selColor&&<span style={{color:NAVY,fontWeight:800,textTransform:"none"}}>— {selColor}</span>}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {colors.map(col=>(
                    <button key={col} onClick={()=>setSelColor(col)}
                      style={{padding:"7px 15px",borderRadius:99,fontSize:12,cursor:"pointer",
                        border:`1.5px solid ${selColor===col?BLUE:"rgba(37,99,235,.2)"}`,
                        background:selColor===col?"rgba(37,99,235,.1)":"#f8fafc",
                        color:selColor===col?BLUE:"#374151",
                        fontWeight:selColor===col?700:500,
                        boxShadow:selColor===col?"0 0 0 3px rgba(37,99,235,.1)":"none",
                        transition:"all .15s"}}>
                      {col}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {p.description&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>
                  Description
                </div>
                <p style={{fontSize:13,color:"#374151",lineHeight:1.8,margin:0}}>
                  {p.description}
                </p>
              </div>
            )}

            <div style={{height:8}}/>
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{padding:"12px 20px",
          paddingBottom:"max(16px,env(safe-area-inset-bottom))",
          borderTop:"1px solid #f1f5f9",background:"#fff",flexShrink:0}}>
          {inStore?(
            <div style={{padding:"13px 16px",borderRadius:12,
              background:"rgba(37,99,235,.05)",border:"1px solid rgba(37,99,235,.15)",
              display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
                background:"rgba(37,99,235,.1)",display:"flex",
                alignItems:"center",justifyContent:"center",color:BLUE}}>
                <Ico d={IC.check} s={17}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:NAVY,marginBottom:2}}>
                  In store
                </div>
                <div style={{fontSize:12,color:C.muted}}>
                  To hide or remove,{" "}
                  <a href="/merchant/chat"
                    style={{color:BLUE,fontWeight:600,textDecoration:"none"}}>
                    contact support
                  </a>
                </div>
              </div>
            </div>
          ):(
            <button onClick={onAdd} disabled={acting||totalStock===0}
              style={{width:"100%",padding:"15px",borderRadius:13,border:"none",
                cursor:acting?"not-allowed":"pointer",fontWeight:700,fontSize:15,
                background:(acting||totalStock===0)?"rgba(15,23,42,.2)":NAVY,
                color:"#fff",transition:"all .2s",
                boxShadow:(totalStock>0&&!acting)?"0 4px 20px rgba(15,23,42,.3)":"none",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <Ico d={IC.plus} s={17} c="#fff"/>
              {acting?"Adding to store…":totalStock===0?"Out of Stock":"Add to My Store"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Catalog card ──────────────────────────────────────────────
function CatalogCard({ p, inStore, onView, onAdd, acting }:{
  p:any; inStore:boolean; onView:()=>void; onAdd:()=>void; acting:boolean;
}) {
  const [hov,setHov] = useState(false);
  const img    = getImg(p);
  const imgs   = getImgs(p);
  const prices = p.variants?.map((v:any)=>v.retailPrice).filter(Boolean)??[];
  const minP   = prices.length?Math.min(...prices):p.suggestedRetail??0;
  const maxP   = prices.length?Math.max(...prices):p.suggestedRetail??0;
  const total  = p.variants?.reduce((a:number,v:any)=>a+(v.stock??0),0)??p.stock??0;
  const profit = calcProfit(p, p.variants?.[0]);

  return (
    <div
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        background:"#fff",
        borderRadius:16,
        overflow:"hidden",
        border:inStore?`2px solid ${BLUE}`:"1.5px solid #f0f2f5",
        transition:"all .22s ease",
        boxShadow:hov?"0 8px 28px rgba(0,0,0,.1)":inStore?"0 2px 10px rgba(37,99,235,.1)":"0 1px 3px rgba(0,0,0,.04)",
        transform:hov?"translateY(-2px)":"none",
      }}>

      {/* Image */}
      <div onClick={onView}
        style={{position:"relative",paddingBottom:"100%",
          background:"#f8fafc",overflow:"hidden",cursor:"pointer"}}>
        <div style={{position:"absolute",inset:0}}>
          {img
            ?<img src={img} alt={p.name} loading="lazy"
               style={{width:"100%",height:"100%",objectFit:"cover",display:"block",
                 transition:"transform .4s ease",
                 transform:hov?"scale(1.06)":"scale(1)"}}
               onError={e=>((e.currentTarget as any).style.opacity="0")}/>
            :<div style={{width:"100%",height:"100%",display:"flex",
              alignItems:"center",justifyContent:"center",background:"#f1f5f9"}}>
              <Ico d={IC.pkg} s={40} c="#cbd5e1"/>
            </div>}
        </div>

        {/* Quick view overlay */}
        <div style={{position:"absolute",inset:0,
          background:"rgba(15,23,42,.4)",
          display:"flex",alignItems:"center",justifyContent:"center",
          opacity:hov?1:0,transition:"opacity .2s",pointerEvents:hov?"auto":"none"}}>
          <div style={{background:"#fff",color:NAVY,fontWeight:700,
            fontSize:12,padding:"8px 18px",borderRadius:99,
            display:"flex",alignItems:"center",gap:5,
            boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
            <Ico d={IC.expand} s={12} c={NAVY}/>
            Quick view
          </div>
        </div>

        {/* In store badge */}
        {inStore&&(
          <div style={{position:"absolute",top:8,right:8,
            display:"flex",alignItems:"center",gap:3,
            background:BLUE,borderRadius:99,
            padding:"3px 9px",zIndex:2}}>
            <Ico d={IC.check} s={9} c="#fff"/>
            <span style={{fontSize:9,fontWeight:700,color:"#fff",letterSpacing:".3px"}}>
              IN STORE
            </span>
          </div>
        )}

        {/* Out of stock */}
        {total===0&&!inStore&&(
          <div style={{position:"absolute",top:8,left:8,
            background:"rgba(220,38,38,.85)",color:"#fff",
            fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:99,zIndex:2}}>
            Out of Stock
          </div>
        )}

        {/* Bottom badges */}
        <div style={{position:"absolute",bottom:8,left:8,right:8,
          display:"flex",justifyContent:"space-between",alignItems:"flex-end",zIndex:2}}>
          {profit>0&&(
            <div style={{background:"rgba(0,0,0,.6)",borderRadius:99,
              padding:"3px 8px",fontSize:9,fontWeight:700,color:GOLD,
              backdropFilter:"blur(4px)"}}>
              +${profit.toFixed(0)}/sale
            </div>
          )}
          {imgs.length>1&&(
            <div style={{background:"rgba(0,0,0,.55)",color:"rgba(255,255,255,.85)",
              fontSize:9,padding:"2px 7px",borderRadius:99,fontFamily:"monospace",
              marginLeft:"auto",backdropFilter:"blur(4px)"}}>
              {imgs.length} photos
            </div>
          )}
        </div>
      </div>

      {/* Card info */}
      <div onClick={onView} style={{padding:"11px 13px 5px",cursor:"pointer"}}>
        <div style={{fontSize:9,color:BLUE,fontWeight:700,
          marginBottom:3,letterSpacing:".5px",textTransform:"uppercase"}}>
          {p.category}
        </div>
        <div className="card-title" style={{fontWeight:600,fontSize:13,color:NAVY,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          marginBottom:4,lineHeight:1.3}}>
          {p.name}
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2}}>
          <span className="card-price" style={{fontFamily:"monospace",fontWeight:800,fontSize:14,color:NAVY}}>
            {minP===maxP?`$${minP.toFixed(2)}`:`$${minP.toFixed(2)}–$${maxP.toFixed(2)}`}
          </span>
          {p.variants?.length>1&&(
            <span style={{fontSize:10,color:"#94a3b8"}}>
              {p.variants.length} variants
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      <div style={{padding:"4px 10px 10px"}}>
        {inStore?(
          <div className="card-btn" style={{width:"100%",padding:"8px",borderRadius:9,
            background:"rgba(37,99,235,.06)",border:"1.5px solid rgba(37,99,235,.15)",
            fontSize:11,fontWeight:700,color:BLUE,
            display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <Ico d={IC.check} s={11} c={BLUE}/>
            In store
          </div>
        ):(
          <button onClick={e=>{e.stopPropagation();onAdd();}}
            disabled={acting||total===0}
            className="card-btn"
            style={{width:"100%",padding:"8px",borderRadius:9,border:"none",
              cursor:acting?"not-allowed":"pointer",fontWeight:700,fontSize:12,
              transition:"all .15s ease",
              background:acting?"rgba(15,23,42,.08)":hov?NAVY:"rgba(15,23,42,.06)",
              color:acting?"#94a3b8":hov?"#fff":NAVY,
              opacity:(acting||total===0)?.55:1,
              display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            {acting
              ?<><span style={{width:11,height:11,borderRadius:"50%",
                  border:"2px solid currentColor",borderTopColor:"transparent",
                  display:"inline-block",animation:"spin .7s linear infinite"}}/>Adding…</>
              :total===0?"Out of Stock"
              :<><Ico d={IC.plus} s={11} c={hov?"#fff":NAVY}/>Add to Store</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── My Store card ─────────────────────────────────────────────
function StoreCard({ sp, onView }:{ sp:any; onView:()=>void }) {
  const [hov,setHov] = useState(false);
  const img    = sp.productImage?.startsWith("http")?sp.productImage:null;
  const profit = +((sp.retailPrice??0)-(sp.basePrice??0)).toFixed(2);

  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      onClick={onView}
      style={{background:"#fff",borderRadius:16,overflow:"hidden",cursor:"pointer",
        border:"1.5px solid #f0f2f5",transition:"all .22s ease",
        boxShadow:hov?"0 8px 24px rgba(0,0,0,.09)":"0 1px 3px rgba(0,0,0,.04)",
        transform:hov?"translateY(-2px)":"none"}}>

      <div style={{position:"relative",paddingBottom:"90%",background:"#f1f5f9",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0}}>
          {img
            ?<img src={img} alt={sp.productName} loading="lazy"
               style={{width:"100%",height:"100%",objectFit:"cover",
                 transition:"transform .4s",transform:hov?"scale(1.05)":"scale(1)"}}
               onError={e=>((e.currentTarget as any).style.opacity="0")}/>
            :<div style={{width:"100%",height:"100%",display:"flex",
              alignItems:"center",justifyContent:"center",background:"#f1f5f9"}}>
              <Ico d={IC.pkg} s={36} c="#cbd5e1"/>
            </div>}
        </div>
        {profit>0&&(
          <div style={{position:"absolute",bottom:8,left:8,
            background:"rgba(0,0,0,.6)",borderRadius:99,
            padding:"3px 8px",fontSize:9,fontWeight:700,
            color:GOLD,backdropFilter:"blur(4px)"}}>
            +${profit.toFixed(0)}/sale
          </div>
        )}
      </div>

      <div style={{padding:"11px 13px 13px"}}>
        <div style={{fontWeight:600,fontSize:13,color:NAVY,
          overflow:"hidden",textOverflow:"ellipsis",
          whiteSpace:"nowrap",marginBottom:6,lineHeight:1.3}}>
          {sp.productName}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:"monospace",fontWeight:800,fontSize:14,color:NAVY}}>
            ${(sp.retailPrice??0).toFixed(2)}
          </span>
          <span style={{fontSize:10,color:"#94a3b8"}}>
            cost ${(sp.basePrice??0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="prod-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
      {[...Array(6)].map((_,i)=>(
        <div key={i} style={{background:"#fff",borderRadius:16,
          border:"1.5px solid #f0f2f5",overflow:"hidden"}}>
          <div style={{paddingBottom:"100%",
            background:"linear-gradient(90deg,#f1f5f9 25%,#e8edf5 50%,#f1f5f9 75%)",
            backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite"}}/>
          <div style={{padding:12}}>
            <div style={{height:9,background:"#f1f5f9",borderRadius:6,width:"35%",marginBottom:8}}/>
            <div style={{height:13,background:"#f1f5f9",borderRadius:6,width:"80%",marginBottom:10}}/>
            <div style={{height:34,background:"#f1f5f9",borderRadius:9}}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function ProductsPage() {
  const ctx  = useMerchant();
  const [tab,    setTab]    = useState<"catalog"|"store">("catalog");
  const [cat,    setCat]    = useState("All");
  const [search, setSearch] = useState("");
  const [viewing,setViewing]= useState<any>(null);
  const [acting, setActing] = useState<string|null>(null);
  const searchRef            = useRef<HTMLInputElement>(null);

  const { items:myItems=[],  loading:myLoad  } = useStoreProducts(ctx.storeId);
  const { items:catalog=[],  loading:catLoad } = useCatalog();

  const hasIt  = (pid:string) => myItems.some((i:any)=>i.productId===pid);

  const filtered = catalog.filter((p:any)=>{
    const mc = cat==="All"||p.category===cat;
    const ms = !search||
      p.name?.toLowerCase().includes(search.toLowerCase())||
      p.vendorName?.toLowerCase().includes(search.toLowerCase());
    return mc&&ms;
  });

  async function handleAdd(p:any) {
    if (hasIt(p.id)) { toast("Already in your store!"); return; }
    setActing(p.id);
    try {
      await addProductToStore({
        storeId:      ctx.storeId,
        merchantId:   ctx.uid,
        productId:    p.id,
        productName:  p.name,
        productImage: getImg(p)||"",
        vendorName:   p.vendorName||"",
        category:     p.category||"",
        basePrice:    p.variants?.[0]?.basePrice??p.basePrice??0,
        retailPrice:  p.variants?.[0]?.retailPrice??p.suggestedRetail??p.retailPrice??0,
        merchantProfit: calcProfit(p, p.variants?.[0]),
        variants:     p.variants||[],
      });
      toast.success(`"${p.name}" added to your store!`);
    } catch(e:any) {
      toast.error(e.message==="Product already in your store"?"Already added!":"Failed to add.");
    }
    setActing(null);
  }

  const totalProfit = myItems.reduce((a:number,i:any)=>a+(i.merchantProfit??0),0);

  return (
    <div style={{paddingBottom:80}}>
      {viewing&&(
        <ProductModal
          p={viewing}
          inStore={hasIt(viewing.id||viewing.productId)}
          onAdd={()=>{ handleAdd(viewing); setViewing(null); }}
          onClose={()=>setViewing(null)}
          acting={!!acting}
        />
      )}

      {/* ── Header ── */}
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:14,gap:10,flexWrap:"wrap"}}>
          <div>
            <h1 style={{fontWeight:900,fontSize:22,letterSpacing:"-.5px",
              color:NAVY,marginBottom:3}}>Products</h1>
            <p style={{fontSize:13,color:C.muted}}>
              {tab==="store"
                ?`${myItems.length} product${myItems.length!==1?"s":""} in your store`
                :`${catalog.length} products available`}
            </p>
          </div>
          {tab==="store"&&myItems.length>0&&(
            <div style={{background:NAVY,borderRadius:12,padding:"9px 16px",
              border:"1px solid rgba(201,168,76,.2)"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.4)",
                textTransform:"uppercase",letterSpacing:"1px",marginBottom:2}}>
                Profit potential
              </div>
              <div style={{fontFamily:"monospace",fontWeight:900,
                fontSize:17,color:GOLD}}>
                +${totalProfit.toFixed(2)}/sale
              </div>
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",
          background:"#f1f5f9",borderRadius:12,padding:3,gap:3}}>
          {[
            {id:"catalog",l:"Browse Catalog",n:catalog.length},
            {id:"store",  l:"My Store",      n:myItems.length},
          ].map(t=>{
            const act=tab===t.id;
            return (
              <button key={t.id} onClick={()=>setTab(t.id as any)}
                style={{padding:"11px",borderRadius:10,border:"none",cursor:"pointer",
                  fontSize:13,fontWeight:act?700:500,transition:"all .2s",
                  background:act?"#fff":"transparent",color:act?NAVY:"#94a3b8",
                  boxShadow:act?"0 2px 8px rgba(0,0,0,.07)":"none",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                {t.l}
                <span style={{fontSize:11,fontFamily:"monospace",
                  color:act?BLUE:"#c4c4c4",fontWeight:600}}>{t.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MY STORE ── */}
      {tab==="store"&&(
        myLoad?<Skeleton/>
        :myItems.length===0?(
          <div style={{background:"#fff",border:"1.5px solid #f0f2f5",
            borderRadius:20,padding:"56px 24px",textAlign:"center",
            boxShadow:"0 2px 12px rgba(0,0,0,.04)"}}>
            <div style={{width:64,height:64,borderRadius:18,
              background:"rgba(15,23,42,.05)",border:"1px solid rgba(15,23,42,.08)",
              display:"flex",alignItems:"center",justifyContent:"center",
              margin:"0 auto 16px"}}>
              <Ico d={IC.store} s={28} c="#94a3b8"/>
            </div>
            <div style={{fontWeight:800,fontSize:18,color:NAVY,marginBottom:8}}>
              Your store is empty
            </div>
            <div style={{fontSize:13,color:C.muted,marginBottom:24,lineHeight:1.7}}>
              Browse the catalog and add products to start selling.<br/>
              You earn profit on every order placed.
            </div>
            <button onClick={()=>setTab("catalog")}
              style={{background:NAVY,color:"#fff",border:"none",borderRadius:12,
                padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",
                boxShadow:"0 4px 16px rgba(15,23,42,.25)"}}>
              Browse Catalog
            </button>
          </div>
        ):(
          <>
            {/* Info notice */}
            <div style={{display:"flex",alignItems:"center",gap:10,
              padding:"11px 14px",borderRadius:12,marginBottom:14,
              background:"rgba(37,99,235,.05)",border:"1px solid rgba(37,99,235,.15)"}}>
              <Ico d={IC.info} s={15} c={BLUE}/>
              <span style={{fontSize:12,color:"#374151"}}>
                Product visibility is managed by TargetGlobal.
                <a href="/merchant/chat"
                  style={{color:BLUE,fontWeight:700,textDecoration:"none",marginLeft:4}}>
                  Contact support
                </a> to request changes.
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}
              className="prod-grid">
              {myItems.map((sp:any)=>{
                const ci=catalog.find((c:any)=>c.id===sp.productId);
                return (
                  <StoreCard key={sp.id} sp={sp}
                    onView={()=>setViewing(ci||{
                      id:sp.productId,name:sp.productName,
                      images:[sp.productImage].filter(Boolean),
                      basePrice:sp.basePrice,suggestedRetail:sp.retailPrice,
                      vendorName:sp.vendorName,category:sp.category,
                      description:"",variants:sp.variants||[],
                    })}/>
                );
              })}
            </div>
          </>
        )
      )}

      {/* ── CATALOG ── */}
      {tab==="catalog"&&(
        <div>
          {/* Search */}
          <div style={{position:"relative",marginBottom:10}}>
            <div style={{position:"absolute",left:13,top:"50%",
              transform:"translateY(-50%)",pointerEvents:"none"}}>
              <Ico d={IC.search} s={15} c="#94a3b8"/>
            </div>
            <input ref={searchRef} value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder={`Search ${catalog.length} products…`}
              style={{width:"100%",padding:"11px 40px 11px 40px",
                border:"1.5px solid #e5e7eb",borderRadius:12,fontSize:14,
                outline:"none",background:"#fff",color:NAVY,boxSizing:"border-box",
                transition:"border .15s"}}
              onFocus={e=>(e.target.style.borderColor=BLUE)}
              onBlur={e=>(e.target.style.borderColor="#e5e7eb")}/>
            {search&&(
              <button onClick={()=>{setSearch("");searchRef.current?.focus();}}
                style={{position:"absolute",right:12,top:"50%",
                  transform:"translateY(-50%)",width:24,height:24,
                  borderRadius:"50%",background:"#e2e8f0",border:"none",
                  cursor:"pointer",display:"flex",alignItems:"center",
                  justifyContent:"center"}}>
                <Ico d={IC.x} s={12} c="#64748b"/>
              </button>
            )}
          </div>

          {/* Category pills */}
          <div style={{display:"flex",gap:6,overflowX:"auto",
            paddingBottom:10,marginBottom:6,scrollbarWidth:"none" as any}}>
            {CATS.map(c=>(
              <button key={c} onClick={()=>setCat(c)}
                style={{padding:"6px 14px",borderRadius:99,flexShrink:0,
                  cursor:"pointer",whiteSpace:"nowrap",
                  fontSize:12,fontWeight:cat===c?700:500,
                  transition:"all .15s ease",
                  border:`1.5px solid ${cat===c?NAVY:"#e5e7eb"}`,
                  background:cat===c?NAVY:"#fff",
                  color:cat===c?"#fff":"#64748b",
                  boxShadow:cat===c?"0 2px 8px rgba(15,23,42,.2)":"none"}}>
                {c}
              </button>
            ))}
          </div>

          {/* Result count */}
          <div style={{fontSize:11,color:"#94a3b8",fontWeight:500,marginBottom:12}}>
            {filtered.length} product{filtered.length!==1?"s":""}
            {cat!=="All"&&` · ${cat}`}
            {search&&` matching "${search}"`}
          </div>

          {catLoad?<Skeleton/>:filtered.length===0?(
            <div style={{background:"#fff",border:"1.5px solid #f0f2f5",
              borderRadius:16,padding:"48px 24px",textAlign:"center"}}>
              <div style={{width:56,height:56,borderRadius:16,
                background:"rgba(15,23,42,.05)",display:"flex",
                alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
                <Ico d={IC.search} s={24} c="#94a3b8"/>
              </div>
              <div style={{fontWeight:700,fontSize:15,color:NAVY,marginBottom:5}}>
                No products found
              </div>
              <div style={{fontSize:13,color:C.muted}}>
                {search?"Try a different search term":"Try another category"}
              </div>
              {search&&(
                <button onClick={()=>setSearch("")}
                  style={{marginTop:14,padding:"8px 20px",borderRadius:10,
                    border:"1.5px solid #e5e7eb",background:"transparent",
                    color:"#374151",fontWeight:600,fontSize:13,cursor:"pointer"}}>
                  Clear search
                </button>
              )}
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}
              className="prod-grid">
              {filtered.map((p:any)=>(
                <CatalogCard key={p.id} p={p}
                  inStore={hasIt(p.id)}
                  onView={()=>setViewing(p)}
                  onAdd={()=>handleAdd(p)}
                  acting={acting===p.id}/>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes sheetUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes shimmer  { from{background-position:-200% 0} to{background-position:200% 0} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        /* Product grid — responsive columns */
        .prod-grid { grid-template-columns:repeat(2,1fr); }
        @media(min-width:640px){ .prod-grid{grid-template-columns:repeat(3,1fr)!important} }
        @media(min-width:900px){ .prod-grid{grid-template-columns:repeat(4,1fr)!important} }
        @media(max-width:400px){ .prod-grid{gap:10px!important} }

        /* Price breakdown — stack on narrow screens */
        @media(max-width:400px){
          .price-grid{grid-template-columns:1fr!important;gap:6px!important}
          .price-grid > div{display:flex!important;align-items:center!important;
            justify-content:space-between!important;text-align:left!important;
            padding:9px 12px!important}
          .price-grid > div > div:first-child{margin-bottom:0!important}
        }

        /* Card text tightening on small screens */
        @media(max-width:400px){
          .card-title{font-size:12px!important}
          .card-price{font-size:14px!important}
          .card-btn{padding:8px!important;font-size:11px!important}
        }

        div::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
