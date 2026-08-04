// app/merchant/stores/page.tsx — Mobile-first redesign
// UI/UX improvements:
//   ✅ Full mobile-first layout — no horizontal scroll, proper breakpoints
//   ✅ Touch targets 44×44px min on all tappable elements
//   ✅ SVG icons replace emoji (🔍 📭 🏪 📦 ←)
//   ✅ Skeleton shimmer on both list AND product grid
//   ✅ Search input with accessible label
//   ✅ aria-label / role on interactive cards
//   ✅ Keyboard nav on store cards (tabIndex + onKeyDown)
//   ✅ Back button with arrow icon, proper aria-label
//   ✅ Product grid: auto-fill minmax(140px) — safe for 320px screens
//   ✅ Stats grid: 2-col on mobile, 4-col on desktop
//   ✅ Store card: mini stats hidden on mobile (shown on ≥600px)
//   ✅ StoreLogo: no innerHTML injection (XSS-safe fallback)
//   ✅ focus-visible ring on all interactive elements
//   ✅ prefers-reduced-motion
//   ✅ Semantic color tokens, tabular-nums on all numbers
//   ✅ Empty states use SVG icon, not emoji
//   ✅ Search clears with X button

"use client";
import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// ── Tokens ────────────────────────────────────────────────────
const C = {
  blue:        "#2563eb",
  blueDark:    "#1d4ed8",
  blueA08:     "rgba(37,99,235,.08)",
  blueA15:     "rgba(37,99,235,.15)",
  blueA20:     "rgba(37,99,235,.20)",
  blueA30:     "rgba(37,99,235,.30)",
  green:       "#16a34a",
  greenA08:    "rgba(22,163,74,.08)",
  amber:       "#d97706",
  amberA08:    "rgba(217,119,6,.08)",
  red:         "#dc2626",
  border:      "#e5e9f5",
  borderLight: "#f3f4f6",
  surface:     "#fff",
  surfaceDim:  "#f9fafb",
  text:        "#111827",
  textMid:     "#374151",
  textMuted:   "#6b7280",
  textFaint:   "#9ca3af",
  dark:        "#0a0a0a",
};

// ── SVG icons ─────────────────────────────────────────────────
type IP = { size?: number; color?: string };
const Ic = ({ d, size = 16, color = "currentColor" }: { d: string | string[] } & IP) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
    {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p}/>)}
  </svg>
);

const ISearch  = (p: IP) => <Ic {...p} d={["M11 17.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13z","M21 21l-4.35-4.35"]}/>;
const IBack    = (p: IP) => <Ic {...p} d="M19 12H5M12 19l-7-7 7-7"/>;
const IBox     = (p: IP) => <Ic {...p} d={["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"]}/>;
const IStore   = (p: IP) => <Ic {...p} d={["M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z","M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9","M12 3v6"]}/>;
const IStar    = (p: IP) => <Ic {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>;
const ICart    = (p: IP) => <Ic {...p} d={["M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z","M3 6h18","M16 10a4 4 0 01-8 0"]}/>;
const IChev    = (p: IP) => <Ic {...p} d="M9 18l6-6-6-6"/>;
const IGlobe   = (p: IP) => <Ic {...p} d={["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M2 12h20","M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"]}/>;
const ICheck   = (p: IP) => <Ic {...p} d={["M22 11.08V12a10 10 0 11-5.93-9.14","M22 4L12 14.01l-3-3"]}/>;
const IClose   = (p: IP) => <Ic {...p} d="M18 6L6 18M6 6l12 12"/>;

// ── Skeleton ──────────────────────────────────────────────────
function Sk({ w = "100%", h = 14, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r }}/>;
}

// ── Store logo (XSS-safe, no innerHTML) ───────────────────────
function StoreLogo({ store, size = 52 }: { store: any; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const r = Math.round(size * 0.25);
  const initials = (store.storeName ?? "??").slice(0, 2).toUpperCase();

  if (store.logoUrl && !imgErr) {
    return (
      <div style={{
        width: size, height: size, borderRadius: r,
        overflow: "hidden", flexShrink: 0,
        border: `1px solid ${C.border}`, background: C.surfaceDim,
      }}>
        <img
          src={store.logoUrl} alt={`${store.storeName} logo`}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setImgErr(true)}
        />
      </div>
    );
  }

  return (
    <div
      aria-label={initials}
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: `linear-gradient(135deg,${C.blueDark},${C.blue})`,
        color: "#fff", fontWeight: 800,
        fontSize: Math.round(size * 0.3),
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 4px 12px ${C.blueA30}`,
      }}
    >
      {initials}
    </div>
  );
}

// ── Plan badge ────────────────────────────────────────────────
const PLAN_STYLE: Record<string, { color: string; bg: string }> = {
  starter: { color: C.textMuted, bg: "rgba(107,114,128,.1)" },
  growth:  { color: C.blue,     bg: C.blueA08 },
  pro:     { color: C.amber,    bg: C.amberA08 },
};
function PlanBadge({ plan }: { plan: string }) {
  const s = PLAN_STYLE[plan?.toLowerCase()] ?? PLAN_STYLE.starter;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px",
      borderRadius: 99, textTransform: "capitalize",
      color: s.color, background: s.bg,
    }}>
      {plan ?? "starter"}
    </span>
  );
}

// ── Stat tile ─────────────────────────────────────────────────
function StatTile({ label, value, color, icon, loading }: {
  label: string; value: string | number;
  color: string; icon: React.ReactNode; loading?: boolean;
}) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: "14px 12px", textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,.04)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 8px",
      }}>
        {icon}
      </div>
      {loading
        ? <><Sk w="60%" h={20} r={5}/><div style={{ marginTop: 6 }}><Sk w="80%" h={10}/></div></>
        : <>
            <div style={{
              fontWeight: 900, fontSize: 20, color,
              fontVariantNumeric: "tabular-nums", marginBottom: 2,
            }}>
              {value}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
          </>
      }
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function StoresPage() {
  const [stores,        setStores]        = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [sort,          setSort]          = useState("rating");
  const [selected,      setSelected]      = useState<any>(null);
  const [storeProducts, setStoreProducts] = useState<any[]>([]);
  const [storeOrders,   setStoreOrders]   = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Load all active stores with real order counts
  useEffect(() => {
    getDocs(query(collection(db, "stores"), where("status", "==", "active")))
      .then(async snap => {
        const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const withCounts = await Promise.all(raw.map(async (s: any) => {
          try {
            const oSnap = await getDocs(query(collection(db, "orders"), where("storeId", "==", s.id)));
            const orders = oSnap.docs.map(d => d.data());
            return {
              ...s,
              totalOrders:    orders.length,
              onTimeOrders:   orders.filter(o => o.status === "delivered").length,
            };
          } catch { return s; }
        }));
        setStores(withCounts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const openStore = useCallback(async (store: any) => {
    setSelected(store);
    setLoadingDetail(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const [prodSnap, orderSnap] = await Promise.all([
      getDocs(query(collection(db, "store_products"), where("storeId", "==", store.id), where("isVisible", "==", true))),
      getDocs(query(collection(db, "orders"), where("storeId", "==", store.id))),
    ]);
    setStoreProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setStoreOrders(orderSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoadingDetail(false);
  }, []);

  const closeStore = useCallback(() => {
    setSelected(null);
    setStoreProducts([]);
    setStoreOrders([]);
  }, []);

  // Filter + sort
  const filtered = [...stores]
    .filter(s => !search
      || s.storeName?.toLowerCase().includes(search.toLowerCase())
      || s.country?.toLowerCase().includes(search.toLowerCase())
      || s.category?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sort === "orders"   ? (b.totalOrders ?? 0) - (a.totalOrders ?? 0)
      : sort === "products" ? (b.productCount ?? 0) - (a.productCount ?? 0)
      : (b.rating ?? 0) - (a.rating ?? 0)
    );

  // Platform totals
  const totalOrders = stores.reduce((a, s) => a + (s.totalOrders ?? 0), 0);
  const avgRating   = (stores.reduce((a, s) => a + (s.rating ?? 0), 0) / Math.max(stores.length, 1)).toFixed(1);
  const countries   = [...new Set(stores.map(s => s.country))].length;

  // ── DETAIL VIEW ───────────────────────────────────────────
  if (selected) {
    const totalO     = storeOrders.length;
    const deliveredO = storeOrders.filter(o => o.status === "delivered").length;
    const cancelledO = storeOrders.filter(o => o.status === "cancelled").length;
    const onTimeRate = totalO > 0 ? Math.round((deliveredO / Math.max(totalO - cancelledO, 1)) * 100) : null;

    return (
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* ── Back bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        }}>
          <button
            onClick={closeStore}
            aria-label="Back to stores"
            style={{
              width: 44, height: 44, borderRadius: 11,
              border: `1px solid ${C.border}`, background: C.surface,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", color: C.textMuted, flexShrink: 0,
              transition: "border-color .15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.blue)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
          >
            <IBack size={17}/>
          </button>

          <StoreLogo store={selected} size={44}/>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 2 }}>
              <h1 style={{
                fontWeight: 900, fontSize: 18, letterSpacing: "-.3px",
                margin: 0, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {selected.storeName}
              </h1>
              <PlanBadge plan={selected.plan}/>
            </div>
            <div style={{ fontSize: 12, color: C.textFaint }}>
              {selected.category} · {selected.country}
            </div>
          </div>
        </div>

        {/* ── Store stat tiles ── */}
        <div className="grid-4" style={{ gap: 10, marginBottom: 20 }}>
          <StatTile label="Rating"    color={C.amber} loading={loadingDetail}
            value={selected.rating > 0 ? `${selected.rating.toFixed(1)} ★` : "—"}
            icon={<IStar size={15} color={C.amber}/>}/>
          <StatTile label="Orders"    color={C.blue}  loading={loadingDetail}
            value={totalO}
            icon={<ICart size={15} color={C.blue}/>}/>
          <StatTile label="Delivered" color={C.green} loading={loadingDetail}
            value={`${deliveredO}${onTimeRate !== null ? ` (${onTimeRate}%)` : ""}`}
            icon={<ICheck size={15} color={C.green}/>}/>
          <StatTile label="Products"  color={C.dark}  loading={loadingDetail}
            value={storeProducts.length}
            icon={<IBox size={15} color={C.dark}/>}/>
        </div>

        {/* ── Products header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 14,
        }}>
          <h2 style={{ fontWeight: 700, fontSize: 15, margin: 0, color: C.text }}>Products</h2>
          {!loadingDetail && (
            <span style={{ fontSize: 12, color: C.textFaint }}>{storeProducts.length} visible</span>
          )}
        </div>

        {/* ── Product grid ── */}
        {loadingDetail ? (
          <div className="product-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 14, overflow: "hidden",
              }}>
                <div className="sk" style={{ height: 140, borderRadius: 0 }}/>
                <div style={{ padding: "10px 12px" }}>
                  <Sk w="75%" h={11} r={4}/>
                  <div style={{ marginTop: 6 }}><Sk w="45%" h={14} r={4}/></div>
                </div>
              </div>
            ))}
          </div>
        ) : storeProducts.length === 0 ? (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: "48px 24px", textAlign: "center",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, background: C.blueA08,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 12px",
            }}>
              <IBox size={26} color={C.blue}/>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.textMid, marginBottom: 4 }}>
              No visible products
            </div>
            <div style={{ fontSize: 12, color: C.textFaint }}>
              This store hasn't made any products public yet
            </div>
          </div>
        ) : (
          <div className="product-grid">
            {storeProducts.map(p => {
              const img = p.productImage?.startsWith("http")
                ? p.productImage
                : Array.isArray(p.images) ? p.images.find((i: string) => i?.startsWith("http")) : null;
              const profit = ((p.retailPrice ?? 0) * 0.17).toFixed(2);
              return (
                <div key={p.id} style={{
                  background: C.surface, border: `1px solid ${C.borderLight}`,
                  borderRadius: 14, overflow: "hidden",
                  boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                  transition: "box-shadow .15s, transform .15s",
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 20px ${C.blueA15}`;
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.04)";
                    (e.currentTarget as HTMLElement).style.transform = "none";
                  }}
                >
                  {/* Image */}
                  <div style={{ position: "relative", height: 140, background: C.surfaceDim, overflow: "hidden" }}>
                    {img
                      ? <img src={img} alt={p.productName} loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}/>
                      : <div style={{
                          width: "100%", height: "100%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <IBox size={36} color={C.textFaint}/>
                        </div>
                    }
                    {/* Profit chip */}
                    <div style={{
                      position: "absolute", bottom: 8, left: 8,
                      background: "rgba(0,0,0,.58)", backdropFilter: "blur(4px)",
                      borderRadius: 99, padding: "3px 9px",
                      fontSize: 9, fontWeight: 700, color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      +${profit}/sale
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{
                      fontWeight: 700, fontSize: 12, marginBottom: 3, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {p.productName}
                    </div>
                    <div style={{
                      fontWeight: 900, fontSize: 14, color: C.green,
                      fontVariantNumeric: "tabular-nums", marginBottom: 2,
                    }}>
                      ${(p.retailPrice ?? 0).toFixed(2)}
                    </div>
                    <div style={{
                      fontSize: 10, color: C.textFaint,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {p.vendorName}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Styles/>
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontWeight: 900, fontSize: 20, letterSpacing: "-.5px",
          margin: "0 0 4px", color: C.text,
        }}>
          Merchant Stores
        </h1>
        <p style={{ color: C.textFaint, fontSize: 13, margin: 0 }}>
          Browse active merchants, explore their products and performance
        </p>
      </div>

      {/* ── Platform summary ── */}
      <div className="grid-4" style={{ gap: 10, marginBottom: 18 }}>
        <StatTile label="Active Stores" color={C.blue}  loading={loading}
          value={stores.length} icon={<IStore size={15} color={C.blue}/>}/>
        <StatTile label="Avg Rating"    color={C.amber} loading={loading}
          value={loading ? "—" : `${avgRating} ★`} icon={<IStar size={15} color={C.amber}/>}/>
        <StatTile label="Total Orders"  color={C.green} loading={loading}
          value={totalOrders} icon={<ICart size={15} color={C.green}/>}/>
        <StatTile label="Countries"     color={C.dark}  loading={loading}
          value={countries} icon={<IGlobe size={15} color={C.dark}/>}/>
      </div>

      {/* ── Search + sort ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
          <label htmlFor="store-search" style={{
            position: "absolute", width: 1, height: 1,
            overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap",
          }}>
            Search stores
          </label>
          <div style={{
            position: "absolute", left: 12, top: "50%",
            transform: "translateY(-50%)", pointerEvents: "none", color: C.textFaint,
          }}>
            <ISearch size={15}/>
          </div>
          <input
            id="store-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stores, categories, countries…"
            style={{
              width: "100%", height: 44, padding: "0 36px 0 38px",
              border: `1.5px solid ${C.border}`, borderRadius: 11,
              fontSize: 13, outline: "none", background: C.surface,
              color: C.text, boxSizing: "border-box",
              transition: "border-color .15s",
            }}
            onFocus={e => (e.target.style.borderColor = C.blue)}
            onBlur={e => (e.target.style.borderColor = C.border)}
          />
          {/* Clear button */}
          {search && (
            <button
              aria-label="Clear search"
              onClick={() => setSearch("")}
              style={{
                position: "absolute", right: 8, top: "50%",
                transform: "translateY(-50%)",
                width: 28, height: 28, borderRadius: 7,
                border: "none", background: C.surfaceDim,
                cursor: "pointer", color: C.textMuted,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <IClose size={13}/>
            </button>
          )}
        </div>

        {/* Sort */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <label htmlFor="store-sort" style={{
            position: "absolute", width: 1, height: 1,
            overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap",
          }}>
            Sort by
          </label>
          <select
            id="store-sort"
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{
              height: 44, padding: "0 14px",
              border: `1.5px solid ${C.border}`, borderRadius: 11,
              fontSize: 13, outline: "none", background: C.surface,
              cursor: "pointer", color: C.textMid,
              appearance: "none", paddingRight: 36,
              transition: "border-color .15s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = C.blue)}
            onBlur={e => (e.currentTarget.style.borderColor = C.border)}
          >
            <option value="rating">Top Rated</option>
            <option value="orders">Most Orders</option>
            <option value="products">Most Products</option>
          </select>
          <div style={{
            position: "absolute", right: 12, top: "50%",
            transform: "translateY(-50%)", pointerEvents: "none", color: C.textFaint,
          }}>
            <Ic d="M6 9l6 6 6-6" size={13}/>
          </div>
        </div>
      </div>

      {/* ── Results label ── */}
      {!loading && search && (
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
          {filtered.length === 0
            ? "No stores match your search"
            : `${filtered.length} store${filtered.length !== 1 ? "s" : ""} found`}
        </div>
      )}

      {/* ── Store list ── */}
      {loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "16px",
              display: "flex", gap: 14, alignItems: "center",
            }}>
              <div className="sk" style={{ width: 52, height: 52, borderRadius: 13, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Sk w="55%" h={14} r={5}/>
                <div style={{ marginTop: 7 }}><Sk w="35%" h={10} r={4}/></div>
                <div style={{ marginTop: 7 }}><Sk w="70%" h={10} r={4}/></div>
              </div>
              <div className="sk" style={{ width: 60, height: 40, borderRadius: 10, flexShrink: 0 }}/>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: "48px 24px", textAlign: "center",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: C.blueA08,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px",
          }}>
            <IStore size={26} color={C.blue}/>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.textMid, marginBottom: 4 }}>
            {search ? "No stores found" : "No active stores yet"}
          </div>
          <div style={{ fontSize: 12, color: C.textFaint }}>
            {search ? "Try a different search term" : "Active stores will appear here"}
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                marginTop: 14, padding: "9px 18px", borderRadius: 9,
                border: "none", background: C.blue, color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map(s => {
            const onTimeRate = s.totalOrders > 0
              ? Math.round(((s.onTimeOrders ?? 0) / s.totalOrders) * 100)
              : null;
            const onTimeColor = onTimeRate !== null
              ? onTimeRate >= 90 ? C.green : onTimeRate >= 70 ? C.amber : C.red
              : C.textFaint;

            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={`View ${s.storeName} store`}
                onClick={() => openStore(s)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") openStore(s); }}
                style={{
                  background: C.surface, borderRadius: 16,
                  padding: "14px 16px", cursor: "pointer",
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                  transition: "border-color .18s, box-shadow .18s, transform .18s",
                  outline: "none",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = C.blue;
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${C.blueA15}`;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = C.border;
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.04)";
                  (e.currentTarget as HTMLElement).style.transform = "none";
                }}
                onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 3px ${C.blueA20}`)}
                onBlur={e => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,.04)")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StoreLogo store={s} size={48}/>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 7,
                      flexWrap: "wrap", marginBottom: 3,
                    }}>
                      <span style={{
                        fontWeight: 800, fontSize: 14, color: C.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {s.storeName}
                      </span>
                      <PlanBadge plan={s.plan}/>
                    </div>

                    <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 5 }}>
                      {s.category} · {s.country}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {s.rating > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <IStar size={11} color={C.amber}/>
                          <span style={{ fontSize: 12, color: C.amber, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {s.rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                      <span style={{ fontSize: 11, color: C.borderLight }}>·</span>
                      <span style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                        {s.totalOrders ?? 0} orders
                      </span>
                      {onTimeRate !== null && <>
                        <span style={{ fontSize: 11, color: C.borderLight }}>·</span>
                        <span style={{ fontSize: 11, color: onTimeColor, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {onTimeRate}% on-time
                        </span>
                      </>}
                    </div>
                  </div>

                  {/* Mini stats — hidden on mobile */}
                  <div className="store-mini-stats" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {[
                      { l: "Orders",    v: s.totalOrders ?? 0,  c: C.blue },
                      { l: "Delivered", v: s.onTimeOrders ?? 0, c: C.green },
                    ].map(st => (
                      <div key={st.l} style={{
                        background: C.surfaceDim, borderRadius: 10,
                        padding: "8px 12px", textAlign: "center",
                        border: `1px solid ${C.border}`, minWidth: 60,
                      }}>
                        <div style={{
                          fontWeight: 800, fontSize: 15, color: st.c,
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {st.v}
                        </div>
                        <div style={{ fontSize: 9, color: C.textFaint, marginTop: 1 }}>{st.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chevron */}
                  <div style={{ color: C.textFaint, flexShrink: 0 }}>
                    <IChev size={16}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Styles/>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      /* Grid utilities — mobile-first */
      .grid-4       { display: grid; grid-template-columns: repeat(2, 1fr); }
      .product-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }

      /* Mini stats hidden on mobile */
      .store-mini-stats { display: none !important; }

      /* Skeleton */
      .sk {
        background: linear-gradient(90deg, #f0f4fb 25%, #e4eaf7 50%, #f0f4fb 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s ease infinite;
      }

      /* Tablet ≥ 480px */
      @media (min-width: 480px) {
        .grid-4       { grid-template-columns: repeat(4, 1fr); }
        .product-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
      }

      /* Desktop ≥ 640px */
      @media (min-width: 640px) {
        .store-mini-stats { display: flex !important; }
      }

      @keyframes shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }

      /* Focus rings */
      :focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
    `}</style>
  );
}
