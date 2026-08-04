// lib/hooks/index.ts — Full hooks: admin + merchant
"use client";
import { useState, useEffect } from "react";
import { sendEmail } from "@/lib/email";
import {
  collection, query, where, orderBy, limit, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  getDocs, writeBatch, Timestamp, getDoc,
} from "firebase/firestore";
import { db } from "../firebase/client";

// ── Generic live hook ─────────────────────────────────────────
function useLive<T>(col: string, constraints: any[], deps: any[]) {
  const [data, setData]       = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, col), ...constraints);
    const unsub = onSnapshot(q, s => {
      setData(s.docs.map(d => ({ id: d.id, ...d.data() }) as any));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, deps);
  return { data, loading };
}

// ── PRODUCTS ──────────────────────────────────────────────────
export function useProducts() {
  return useLive<any>("products", [orderBy("createdAt","desc")], []);
}
export async function createProduct(data: any) {
  const ref = await addDoc(collection(db,"products"), {
    ...data,
    stock: data.variants?.reduce((a:number,v:any)=>a+v.stock,0) ?? data.stock ?? 0,
    basePrice: data.variants?.[0]?.basePrice ?? data.basePrice ?? 0,
    suggestedRetail: data.variants?.[0]?.retailPrice ?? data.suggestedRetail ?? 0,
    retailPrice: data.variants?.[0]?.retailPrice ?? data.retailPrice ?? 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  if (data.vendorId) {
    const vDocs = await getDocs(query(collection(db,"vendors"),where("__name__","==",data.vendorId)));
    if (!vDocs.empty) await updateDoc(doc(db,"vendors",data.vendorId),{ productsCount: (vDocs.docs[0].data().productsCount??0)+1 });
  }
  return ref;
}
export async function updateProduct(id: string, data: any) {
  const updateData:any = { ...data, updatedAt: serverTimestamp() };
  if (data.variants) {
    updateData.stock          = data.variants.reduce((a:number,v:any)=>a+v.stock,0);
    updateData.basePrice      = Math.min(...data.variants.map((v:any)=>v.basePrice));
    updateData.suggestedRetail= Math.min(...data.variants.map((v:any)=>v.retailPrice));
    updateData.retailPrice    = Math.min(...data.variants.map((v:any)=>v.retailPrice));
  }
  await updateDoc(doc(db,"products",id), updateData);
}
export async function deleteProduct(id: string) {
  await deleteDoc(doc(db,"products",id));
}

// ── VENDORS ───────────────────────────────────────────────────
export function useVendors() {
  return useLive<any>("vendors", [orderBy("name","asc")], []);
}
export async function createVendor(data: any) {
  return addDoc(collection(db,"vendors"),{...data,productsCount:0,joinedAt:serverTimestamp()});
}
export async function updateVendor(id:string, data:any) {
  await updateDoc(doc(db,"vendors",id),{...data,updatedAt:serverTimestamp()});
}
export async function deleteVendor(id:string) {
  await deleteDoc(doc(db,"vendors",id));
}
export async function toggleVendorStatus(id:string, current:string) {
  const next = current === "active" ? "inactive" : "active";
  await updateDoc(doc(db,"vendors",id),{status:next,updatedAt:serverTimestamp()});
}

// ── STORES ────────────────────────────────────────────────────
export function useAllStores() {
  return useLive<any>("stores",[orderBy("joinedAt","desc")],[]);
}
export async function blockStore(id:string, reason:string) {
  await updateDoc(doc(db,"stores",id),{status:"blocked",blockedReason:reason,updatedAt:serverTimestamp()});
}
export async function unblockStore(id:string) {
  await updateDoc(doc(db,"stores",id),{status:"active",blockedReason:"",updatedAt:serverTimestamp()});
}
export async function updateStorePlan(id:string, plan:string) {
  const rates:Record<string,number>  = {starter:0.03,growth:0.025,pro:0.02};
  const limits:Record<string,number> = {starter:10,growth:50,pro:999};
  await updateDoc(doc(db,"stores",id),{
    plan, commissionRate:rates[plan], maxProducts:limits[plan], updatedAt:serverTimestamp(),
  });
}

// ── KYC ───────────────────────────────────────────────────────
export function useKYC(statusFilter?:string) {
  const [subs,setSubs]       = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    const constraints:any[] = [];
    if(statusFilter) constraints.push(where("status","==",statusFilter));
    return onSnapshot(
      query(collection(db,"kyc_submissions"),...constraints),
      s => { setSubs(s.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); },
      () => setLoading(false)
    );
  },[statusFilter]);
  return {subs, loading};
}
export async function approveKYC(kyc:any, adminUid:string) {
  const batch = writeBatch(db);
  batch.update(doc(db,"kyc_submissions",kyc.id!),{status:"approved",reviewedBy:adminUid,reviewedAt:serverTimestamp()});
  batch.update(doc(db,"stores",kyc.storeId),{status:"active",updatedAt:serverTimestamp()});
  batch.update(doc(db,"users",kyc.merchantId),{kycVerified:true,updatedAt:serverTimestamp()});
  batch.set(doc(collection(db,"notifications")),{
    userId:kyc.merchantId, title:"🎉 Store Approved!",
    body:`Your store "${kyc.storeName}" is now live! Browse the catalog and start adding products.`,
    type:"kyc",read:false,createdAt:serverTimestamp(),
  });
  await batch.commit();
}
export async function rejectKYC(kyc:any, adminUid:string, reason:string) {
  const batch = writeBatch(db);
  batch.update(doc(db,"kyc_submissions",kyc.id!),{status:"rejected",rejectionReason:reason,reviewedBy:adminUid,reviewedAt:serverTimestamp()});
  batch.update(doc(db,"stores",kyc.storeId),{status:"suspended",updatedAt:serverTimestamp()});
  batch.set(doc(collection(db,"notifications")),{
    userId:kyc.merchantId, title:"❌ KYC Rejected",
    body:`Your ID verification was not approved. Reason: ${reason}. Please contact support.`,
    type:"kyc",read:false,createdAt:serverTimestamp(),
  });
  await batch.commit();
}

// ── ADMIN ORDERS ──────────────────────────────────────────────
export function useAllOrders() {
  const [orders,setOrders]   = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    return onSnapshot(
      query(collection(db,"orders"),orderBy("placedAt","desc")),
      s => { setOrders(s.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); },
      () => setLoading(false)
    );
  },[]);
  return {orders, loading};
}
export async function updateOrderStatus(id:string, status:string, trackingNumber?:string) {
  const data:any = {status, updatedAt:serverTimestamp()};
  if(trackingNumber) data.trackingNumber = trackingNumber;
  if(status==="delivered") { data.deliveredAt=serverTimestamp(); }
  await updateDoc(doc(db,"orders",id), data);
  // Update store stats when order delivered
  if(status==="delivered"){
    try{
      const orderSnap=await getDoc(doc(db,"orders",id));
      const oData=orderSnap.data();
      if(oData?.storeId){
        const storeSnap=await getDoc(doc(db,"stores",oData.storeId));
        if(storeSnap.exists()){
          const s=storeSnap.data();
          await updateDoc(doc(db,"stores",oData.storeId),{
            totalOrders:(s.totalOrders??0)+1,
            onTimeOrders:(s.onTimeOrders??0)+1,
            updatedAt:serverTimestamp(),
          });
        }
      }
    }catch(e){console.warn("Store stat update failed",e);}
  }
}
export async function cancelOrderAndBlock(orderId:string, storeId:string) {
  await updateDoc(doc(db,"orders",orderId),{status:"cancelled",updatedAt:serverTimestamp()});
  await updateDoc(doc(db,"stores",storeId),{status:"blocked",blockedReason:"Order not fulfilled within 48 hours.",updatedAt:serverTimestamp()});
}
export async function placeAdminOrder(params:{
  storeId:string; merchantId:string; storeName:string; adminId:string;
  customer:any; items:any[]; notes:string;
}) {
  const {storeId,merchantId,storeName,adminId,customer,items,notes} = params;
  const subtotal      = items.reduce((a,i)=>a+i.unitPrice*i.quantity,0);
  const totalBaseCost = items.reduce((a,i)=>a+i.basePrice*i.quantity,0);
  const estimatedDelivery = new Date();
  estimatedDelivery.setDate(estimatedDelivery.getDate()+3);
  const ref = await addDoc(collection(db,"orders"),{
    storeId, merchantId, storeName, placedByAdmin:true, adminId,
    customer, items, subtotal:+subtotal.toFixed(2), total:+subtotal.toFixed(2),
    totalBaseCost:+totalBaseCost.toFixed(2),
    status:"pending", notes, fundsDeducted:false,
    estimatedDelivery: Timestamp.fromDate(estimatedDelivery),
    placedAt:serverTimestamp(), updatedAt:serverTimestamp(),
  });
  await addDoc(collection(db,"notifications"),{
    userId:      merchantId,
    title:       "📦 New Order Received!",
    body:        `A new order has been placed on ${storeName}. Review and submit it to start processing.`,
    type:        "order",
    read:        false,
    createdAt:   serverTimestamp(),
    // Order metadata — used by merchant notification popup
    orderId:     ref.id,
    orderShortId:ref.id.slice(-8).toUpperCase(),
    storeName,
    customerName:   customer?.name ?? "Customer",
    customerCity:   customer?.address?.city ?? "",
    itemCount:      items.length,
    firstItem:      items[0]?.productName ?? "",
    orderTotal:     +subtotal.toFixed(2),
    estimatedProfit:+(subtotal * 0.164).toFixed(2),
  });

  // Email the merchant about their new order
  try {
    const merchantSnap = await getDoc(doc(db,"users",merchantId));
    const merchantEmail = merchantSnap.data()?.email;
    if (merchantEmail) {
      const subtotalVal = items.reduce((a:any,i:any)=>a+(i.unitPrice??0)*(i.quantity??1),0);
      const profit = +(subtotalVal * 0.164).toFixed(2); // ~16.4% net after 3% fee
      await sendEmail({
        type:         "order_placed",
        to:           merchantEmail,
        merchantName: merchantSnap.data()?.displayName ?? storeName,
        storeName,
        customerName: customer?.name ?? "Customer",
        customerAddress: customer?.address
          ? [customer.address.line1, customer.address.city, customer.address.country].filter(Boolean).join(", ")
          : undefined,
        orderId: ref.id,
        items: items.map((i:any) => ({
          productName:  i.productName,
          productImage: i.productImage ?? i.imageUrl,
          size:         i.size,
          color:        i.color,
          quantity:     i.quantity ?? 1,
          unitPrice:    i.unitPrice ?? 0,
        })),
        totalBaseCost:  +subtotalVal.toFixed(2),
        merchantProfit: profit,
      });
    }
  } catch (e) {
    console.warn("[placeAdminOrder] email failed:", e);
  }

  return ref;
}

// ── STORE PRODUCTS ────────────────────────────────────────────
export function useStoreProducts(storeId:string|null) {
  const [items,setItems]     = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    if(!storeId){setLoading(false);return;}
    return onSnapshot(
      query(collection(db,"store_products"),where("storeId","==",storeId)),
      s => { setItems(s.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }
    );
  },[storeId]);
  return {items, loading};
}
export async function adminDeleteStoreProduct(id:string) {
  await deleteDoc(doc(db,"store_products",id));
}

// ── WALLETS (admin) ───────────────────────────────────────────
export function useAllWallets() {
  return useLive<any>("wallets",[orderBy("updatedAt","desc")],[]);
}
export async function adjustWalletBalance(params:{
  merchantId:string; storeId:string; merchantName:string;
  type:"credit"|"debit"; amountUSD:number; reason:string;
  coin?:string; network?:string;
}) {
  const {merchantId,storeId,merchantName,type,amountUSD,reason,coin="USDT",network="TRC20"} = params;
  const wSnap = await getDocs(query(collection(db,"wallets"),where("merchantId","==",merchantId),limit(1)));
  if(wSnap.empty) throw new Error("Wallet not found");
  const wDoc = wSnap.docs[0];
  const w    = wDoc.data();
  const cur  = w.usdEquivalent??0;
  const curUSDT = w.balances?.USDT_TRC20??0;
  const newUSD  = type==="credit"?cur+amountUSD:Math.max(0,cur-amountUSD);
  const newUSDT = type==="credit"?curUSDT+amountUSD:Math.max(0,curUSDT-amountUSD);
  await updateDoc(wDoc.ref,{"balances.USDT_TRC20":newUSDT,usdEquivalent:newUSD,updatedAt:serverTimestamp()});
  await addDoc(collection(db,"transactions"),{
    merchantId,storeId,merchantName,
    type:type==="credit"?"deposit":"withdrawal",
    coin,network,amount:amountUSD,usdValue:amountUSD,
    txHash:`adj_${Date.now()}`,status:"confirmed",
    description:`Admin: ${reason}`,createdAt:serverTimestamp(),
  });
  await addDoc(collection(db,"notifications"),{
    userId:merchantId,
    title:type==="credit"?"💰 Funds Added":"💸 Funds Deducted",
    body:`$${amountUSD.toFixed(2)} ${type==="credit"?"credited to":"deducted from"} your wallet. ${reason}`,
    type:type==="credit"?"earning":"deposit",read:false,createdAt:serverTimestamp(),
  });
}

// ── REIMBURSEMENTS ────────────────────────────────────────────
export async function processDueReimbursements() {
  const now = new Date();
  const due = await getDocs(query(collection(db,"pending_reimbursements"),where("processed","==",false)));
  let count = 0;
  for(const d of due.docs){
    const data  = d.data();
    const dueAt = data.dueAt?.toDate?.();
    if(!dueAt||dueAt>now) continue;
    const wSnap = await getDocs(query(collection(db,"wallets"),where("merchantId","==",data.merchantId),limit(1)));
    if(wSnap.empty) continue;
    const wDoc  = wSnap.docs[0];
    const w     = wDoc.data();
    const total = data.totalReimbursement??0;
    await updateDoc(wDoc.ref,{
      "balances.USDT_TRC20":(w.balances?.USDT_TRC20??0)+total,
      usdEquivalent:(w.usdEquivalent??0)+total,
      updatedAt:serverTimestamp(),
    });
    await addDoc(collection(db,"transactions"),{
      merchantId:data.merchantId,storeId:data.storeId,merchantName:data.merchantName,
      type:"earning",coin:"USDT",network:"TRC20",
      amount:total,usdValue:total,
      txHash:`reimb_${Date.now()}_${count}`,status:"confirmed",
      description:`Order reimbursement: $${data.totalBaseCost?.toFixed(2)} cost + $${data.merchantProfit?.toFixed(2)} profit`,
      createdAt:serverTimestamp(),
    });
    if(data.orderId) await updateDoc(doc(db,"orders",data.orderId),{status:"delivered",reimbursed:true,updatedAt:serverTimestamp()});
    await addDoc(collection(db,"notifications"),{
      userId:data.merchantId, title:"💰 Payment Received!",
      body:`$${total.toFixed(2)} added to your wallet (order delivered).`,
      type:"earning",read:false,createdAt:serverTimestamp(),
    });
    await updateDoc(d.ref,{processed:true,processedAt:serverTimestamp()});
    count++;
  }
  return count;
}

export async function sendNotification(userId:string, title:string, body:string, type:string="info") {
  await addDoc(collection(db,"notifications"),{userId,title,body,type,read:false,createdAt:serverTimestamp()});
}

// ── SEND RICH STATUS NOTIFICATION ────────────────────────────
export async function sendOrderStatusNotification(
  merchantId: string,
  orderId: string,
  status: string,
  trackingNumber?: string,
  orderData?: { storeName?:string; orderTotal?:number; profit?:number }
) {
  const msgs: Record<string,{title:string;body:string}> = {
    submitted:  { title:"📋 Order Submitted",    body:"Your order has been received and is being prepared for processing." },
    processing: { title:"⚙️ Order Processing",    body:"Great news — your order is being packed and prepared for shipment." },
    shipped:    { title:"🚚 Order Shipped",       body:`Your order is on its way!${trackingNumber?` Tracking #: ${trackingNumber}`:""}`},
    delivered:  { title:"✅ Order Delivered!",    body:"Delivery confirmed. Your profit has been credited to your wallet." },
    cancelled:  { title:"❌ Order Cancelled",     body:"Your order has been cancelled. Contact support if you have questions." },
  };
  const m = msgs[status] ?? { title:"📦 Order Updated", body:`Your order status changed to ${status}.` };
  await addDoc(collection(db,"notifications"),{
    userId:         merchantId,
    title:          m.title,
    body:           m.body,
    type:           "order",
    read:           false,
    createdAt:      serverTimestamp(),
    orderId,
    orderShortId:   orderId.slice(-8).toUpperCase(),
    status,
    trackingNumber: trackingNumber ?? null,
    storeName:      orderData?.storeName ?? "",
    orderTotal:     orderData?.orderTotal ?? 0,
    estimatedProfit:orderData?.profit ?? 0,
  });
}

// ── WITHDRAWALS (admin) ───────────────────────────────────────

// ── ADMIN: store products by storeId ─────────────────────────
export function useAdminStoreProducts(storeId: string | null) {
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!storeId) { setItems([]); setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"store_products"), where("storeId","==",storeId)),
      s => { setItems(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error("useAdminStoreProducts error:", err); setLoading(false); }
    );
  }, [storeId]);
  return { items, loading };
}

export async function adminRemoveStoreProduct(storeProductId: string) {
  await deleteDoc(doc(db, "store_products", storeProductId));
}

export function useAllWithdrawals() {
  return useLive<any>("withdrawals",[orderBy("requestedAt","desc")],[]);
}
export async function approveWithdrawal(id:string, adminUid:string) {
  const snap = await getDoc(doc(db,"withdrawals",id));
  if(!snap.exists()) return;
  const w = snap.data();
  await updateDoc(doc(db,"withdrawals",id),{status:"approved",reviewedBy:adminUid,reviewedAt:serverTimestamp()});
  await adjustWalletBalance({
    merchantId:w.merchantId,storeId:w.storeId,merchantName:w.merchantName||"",
    type:"debit",amountUSD:w.usdValue||w.amount,
    reason:`Withdrawal approved: ${w.amount} ${w.coin}`,
  });
}
export async function rejectWithdrawal(id:string, adminUid:string, reason:string) {
  await updateDoc(doc(db,"withdrawals",id),{status:"rejected",rejectionReason:reason,reviewedBy:adminUid,reviewedAt:serverTimestamp()});
}

// ── TRANSACTIONS (admin) ──────────────────────────────────────
export function useAllTransactions() {
  return useLive<any>("transactions",[orderBy("createdAt","desc"),limit(200)],[]);
}
export function useTransactions() {
  return useLive<any>("transactions",[orderBy("createdAt","desc"),limit(200)],[]);
}

// ── CHAT (admin) ──────────────────────────────────────────────
export function useChatRooms() {
  return useLive<any>("chat_rooms",[orderBy("lastMessageAt","desc")],[]);
}
export function useChatMessages(roomId:string|null) {
  const [msgs,setMsgs]     = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    if(!roomId){setLoading(false);return;}
    return onSnapshot(
      query(collection(db,"chat_rooms",roomId,"messages"),orderBy("createdAt","asc")),
      s => { setMsgs(s.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }
    );
  },[roomId]);
  return {msgs, loading};
}
export async function sendAdminMessage(roomId:string, text:string, adminId:string, merchantId:string) {
  await addDoc(collection(db,"chat_rooms",roomId,"messages"),{
    senderId:adminId,senderRole:"admin",senderName:"Support Team",
    text,createdAt:serverTimestamp(),read:false,
  });
  const snap = await getDoc(doc(db,"chat_rooms",roomId));
  await updateDoc(doc(db,"chat_rooms",roomId),{
    lastMessage:text,lastMessageAt:serverTimestamp(),
    unreadMerchant:(snap.data()?.unreadMerchant??0)+1,
    unreadAdmin:0,
  });
}

// ═══════════════════════════════════════════════════════════════
// ── MERCHANT HOOKS ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// ── NOTIFICATIONS ─────────────────────────────────────────────
export function useNotifications(userId: string | null) {
  const [notifs, setNotifs]   = useState<any[]>([]);
  const [unread, setUnread]   = useState(0);
  useEffect(() => {
    if (!userId) { setNotifs([]); setUnread(0); return; }
    return onSnapshot(
      query(collection(db,"notifications"),
        where("userId","==",userId),
        orderBy("createdAt","desc"),
        limit(50)
      ),
      s => {
        const n = s.docs.map(d => ({ id:d.id, ...d.data() }));
        setNotifs(n);
        setUnread(n.filter((x:any) => !x.read).length);
      },
      () => {}
    );
  }, [userId]);

  async function markRead(id: string) {
    await updateDoc(doc(db,"notifications",id), { read:true });
  }
  async function markAllRead() {
    const unreadItems = notifs.filter((n:any) => !n.read);
    if (unreadItems.length === 0) return;
    const batch = writeBatch(db);
    unreadItems.forEach((n:any) => batch.update(doc(db,"notifications",n.id), { read:true }));
    await batch.commit();
  }
  return { notifs, unread, markRead, markAllRead };
}

// ── MERCHANT STORE ────────────────────────────────────────────
export function useMerchantStore(merchantId: string | null) {
  const [store, setStore]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!merchantId) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"stores"), where("merchantId","==",merchantId), limit(1)),
      s => { setStore(s.empty ? null : { id:s.docs[0].id, ...s.docs[0].data() }); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId]);
  return { store, loading };
}

// ── MERCHANT KYC ──────────────────────────────────────────────
export function useMerchantKYC(merchantId: string | null) {
  const [kyc, setKyc]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!merchantId) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"kyc_submissions"), where("merchantId","==",merchantId), limit(1)),
      s => { setKyc(s.empty ? null : { id:s.docs[0].id, ...s.docs[0].data() }); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId]);
  return { kyc, loading };
}

// ── MERCHANT ORDERS ───────────────────────────────────────────
export function useOrders(merchantId: string | null, statusFilter?: string) {
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [now,       setNow]       = useState(() => Date.now());
  const [loading,   setLoading]   = useState(true);

  // Re-check every 60 seconds so scheduled orders unlock automatically
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!merchantId) { setLoading(false); return; }
    const constraints: any[] = [
      where("merchantId","==",merchantId),
      orderBy("placedAt","desc"),
    ];
    if (statusFilter) constraints.splice(1, 0, where("status","==",statusFilter));
    return onSnapshot(
      query(collection(db,"orders"), ...constraints),
      s => { setAllOrders(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId, statusFilter ?? ""]);

  // Filter: hide orders whose scheduled dispatch time hasn't arrived yet
  const orders = allOrders.filter(o => {
    if (!o.scheduledDispatchAt) return true; // no schedule = always visible
    const dispatchTime = o.scheduledDispatchAt?.toDate?.()?.getTime?.() ?? 0;
    return dispatchTime <= now;              // only show once time has passed
  });

  return { orders, loading };
}

export async function submitMerchantOrder(params: {
  orderId: string; merchantId: string; storeId: string; storeName: string;
  merchantEmail?: string;
  totalBaseCost: number; totalRetailCost?: number;
  storeSettings: { deliveryDays: number; commissionRate: number };
}) {
  const { orderId, merchantId, storeId, storeName, merchantEmail, totalBaseCost, totalRetailCost, storeSettings } = params;
  // Financial model:
  // Merchant pays retail price upfront from wallet
  // Customer pays retail + 20% on delivery
  // Platform takes 3% of customer payment
  // Merchant profit = customerPays - platformFee - retail
  const retailCost    = totalRetailCost ?? totalBaseCost;
  const custPayment   = +(retailCost * 1.20).toFixed(2);                            // customer pays retail + 20%
  const commission    = +(custPayment * storeSettings.commissionRate).toFixed(2);   // 3% of customer payment
  const reimbursement = +(custPayment - commission).toFixed(2);                     // merchant receives back
  const profit        = +(reimbursement - retailCost).toFixed(2);                   // net profit to merchant
  const dueAt         = new Date();
  dueAt.setDate(dueAt.getDate() + (storeSettings.deliveryDays ?? 3));

  // Deduct retail cost from wallet
  const wSnap = await getDocs(query(collection(db,"wallets"),where("merchantId","==",merchantId),limit(1)));
  if (wSnap.empty) throw new Error("Wallet not found");
  const wDoc  = wSnap.docs[0];
  const w     = wDoc.data();
  const cur   = w.usdEquivalent ?? 0;
  const curUSDT = w.balances?.USDT_TRC20 ?? 0;
  if (cur < retailCost) throw new Error(`Insufficient balance. Need $${retailCost.toFixed(2)}, have $${cur.toFixed(2)}`);
  await updateDoc(wDoc.ref, {
    "balances.USDT_TRC20": curUSDT - retailCost,
    usdEquivalent: cur - retailCost,
    updatedAt: serverTimestamp(),
  });

  // Notify merchant of successful submission
  await addDoc(collection(db,"notifications"),{
    userId:      merchantId,
    title:       "✅ Order Submitted Successfully",
    body:        `Your order has been submitted and is being processed. Your profit will be credited after delivery.`,
    type:        "order",
    read:        false,
    createdAt:   serverTimestamp(),
    orderId,
    orderShortId:orderId.slice(-8).toUpperCase(),
    orderTotal:  +(retailCost ?? 0),
    estimatedProfit: +profit.toFixed(2),
    storeName,
  });

  // Update order — include merchantEmail so admin can send status emails
  await updateDoc(doc(db,"orders",orderId), {
    status: "submitted", fundsDeducted: true,
    merchantEmail: merchantEmail ?? null,
    totalRetailCost: retailCost, customerPayment: custPayment,
    platformCommission: commission, totalReimbursement: reimbursement,
    merchantEarnings: profit,
    submittedAt: serverTimestamp(),
    reimbursementDue: Timestamp.fromDate(dueAt),
    updatedAt: serverTimestamp(),
  });

  // Pending reimbursement record
  await addDoc(collection(db,"pending_reimbursements"), {
    orderId, merchantId, storeId, merchantName: storeName,
    totalBaseCost, totalRetailCost: retailCost,
    merchantProfit: profit, totalReimbursement: reimbursement,
    dueAt: Timestamp.fromDate(dueAt),
    processed: false, createdAt: serverTimestamp(),
  });

  // Deduction transaction record
  await addDoc(collection(db,"transactions"), {
    merchantId, storeId, merchantName: storeName,
    type: "withdrawal", coin: "USDT", network: "TRC20",
    amount: retailCost, usdValue: retailCost,
    txHash: `order_${orderId}_${Date.now()}`,
    status: "confirmed",
    description: `Order submitted — retail cost deducted`,
    createdAt: serverTimestamp(),
  });
}

// ── MERCHANT WALLET ───────────────────────────────────────────
export function useWallet(merchantId: string | null) {
  const [wallet, setWallet]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!merchantId) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"wallets"), where("merchantId","==",merchantId), limit(1)),
      s => { setWallet(s.empty ? null : { id:s.docs[0].id, ...s.docs[0].data() }); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId]);
  return { wallet, loading };
}

// ── LIVE EXCHANGE RATES ──────────────────────────────────────
// Uses CoinGecko free API — no key needed
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=bitcoin,ethereum,tether" +
  "&vs_currencies=usd,aed,sar,ngn,gbp,eur,cad,aud,inr,pkr";

export interface LiveRates {
  BTC:  Record<string, number>;
  ETH:  Record<string, number>;
  USDT: Record<string, number>;
}

export function useLiveRates() {
  const [rates,   setRates]   = useState<LiveRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchRates() {
      try {
        const res  = await fetch(COINGECKO_URL);
        const data = await res.json();
        if (!cancelled) {
          setRates({
            BTC:  data.bitcoin  ?? {},
            ETH:  data.ethereum ?? {},
            USDT: data.tether   ?? {},
          });
          setLoading(false);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError("Could not fetch live rates");
          setLoading(false);
        }
      }
    }

    fetchRates();
    const interval = setInterval(fetchRates, 60_000); // refresh every 60s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { rates, loading, error };
}

export function useDepositAddresses(merchantId: string | null) {
  const [addrs, setAddrs] = useState<any[]>([]);
  useEffect(() => {
    if (!merchantId) return;
    return onSnapshot(
      query(collection(db,"deposit_addresses"), where("merchantId","==",merchantId)),
      s => setAddrs(s.docs.map(d => ({ id:d.id, ...d.data() })))
    );
  }, [merchantId]);
  return { addrs };
}


// ── MERCHANT DEPOSIT REQUESTS ─────────────────────────────────
export function useDepositRequests(merchantId: string | null) {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  useEffect(() => {
    if (!merchantId) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"deposit_requests"),
        where("merchantId","==",merchantId),
        orderBy("requestedAt","desc")
      ),
      s => { setDeposits(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId]);
  return { deposits, loading };
}

export async function requestWithdrawal(params: {
  merchantId: string; storeId: string; merchantName: string;
  coin: string; network: string; amount: number; usdValue: number;
  destinationAddress: string;
}) {
  await addDoc(collection(db,"withdrawals"), {
    ...params, status:"pending", requestedAt: serverTimestamp(),
  });
}

// ── MERCHANT WITHDRAWALS ──────────────────────────────────────
export function useWithdrawals(merchantId?: string | null) {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  useEffect(() => {
    const constraints: any[] = merchantId
      ? [where("merchantId","==",merchantId), orderBy("requestedAt","desc")]
      : [orderBy("requestedAt","desc")];
    return onSnapshot(
      query(collection(db,"withdrawals"), ...constraints),
      s => { setWithdrawals(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId ?? ""]);
  return { withdrawals, wds: withdrawals, loading };
}

// ── MERCHANT TRANSACTIONS ─────────────────────────────────────
export function useMerchantTransactions(merchantId: string | null) {
  const [data, setData]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!merchantId) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"transactions"),
        where("merchantId","==",merchantId),
        orderBy("createdAt","desc"),
        limit(100)
      ),
      s => { setData(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, [merchantId]);
  return { data, loading };
}

// ── CATALOG ───────────────────────────────────────────────────
export function useCatalog() {
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    return onSnapshot(
      query(collection(db,"products"), where("status","==","active")),
      s => { setItems(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, []);
  return { items, loading };
}

export async function addProductToStore(params: {
  storeId: string; merchantId: string; productId: string;
  productName: string; productImage: string; vendorName: string;
  category: string; basePrice: number; retailPrice: number;
  merchantProfit: number; variants?: any[];
}) {
  const existing = await getDocs(query(collection(db,"store_products"),
    where("storeId","==",params.storeId),
    where("productId","==",params.productId)
  ));
  if (!existing.empty) throw new Error("Product already in your store");
  return addDoc(collection(db,"store_products"), {
    ...params, isVisible:true, addedAt:serverTimestamp(),
  });
}

export async function removeProductFromStore(storeProductId: string) {
  await deleteDoc(doc(db,"store_products",storeProductId));
}


// ── REFERRAL SYSTEM ───────────────────────────────────────────

/** Generate a unique referral code: FS-XXXXX (uppercase alphanumeric) */
export function generateReferralCode(name: string): string {
  const prefix = name.trim().split(" ")[0].toUpperCase().replace(/[^A-Z]/g,"").slice(0,4) || "FS";
  const chars  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O,0,1,I to avoid confusion
  let suffix   = "";
  for (let i=0; i<5; i++) suffix += chars[Math.floor(Math.random()*chars.length)];
  return `${prefix}-${suffix}`;
}

/** Validate a referral code — returns the referrer's uid or null */
export async function validateReferralCode(code: string): Promise<{uid:string;name:string}|null> {
  if (!code.trim()) return null;
  try {
    const snap = await getDocs(
      query(collection(db,"referral_codes"), where("code","==",code.toUpperCase().trim()))
    );
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return { uid: data.merchantId, name: data.merchantName };
  } catch { return null; }
}

/** Create referral code document for a new merchant */
export async function createReferralCode(code: string, merchantId: string, merchantName: string) {
  await addDoc(collection(db,"referral_codes"), {
    code, merchantId, merchantName, createdAt: serverTimestamp(),
  });
}

/** Get a merchant's referral code and stats */
export function useReferralCode(uid: string | null) {
  const [referralCode, setReferralCode] = useState<string|null>(null);
  const [referrals,    setReferrals]    = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(()=>{
    if (!uid) { setLoading(false); return; }
    // Get user's own referral code
    return onSnapshot(doc(db,"users",uid), snap=>{
      if (snap.exists()) setReferralCode(snap.data().referralCode ?? null);
      setLoading(false);
    });
  },[uid]);

  useEffect(()=>{
    if (!referralCode) { setReferrals([]); return; }
    // Get merchants who used this referral code
    return onSnapshot(
      query(collection(db,"users"), where("referredBy","==",referralCode)),
      snap => setReferrals(snap.docs.map(d=>({id:d.id,...d.data()})))
    );
  },[referralCode]);

  return { referralCode, referrals, loading };
}

// ── MERCHANT CHAT ─────────────────────────────────────────────
export function useMerchantChatRoom(merchantId: string | null) {
  const [room, setRoom] = useState<any>(null);
  useEffect(() => {
    if (!merchantId) return;
    return onSnapshot(
      query(collection(db,"chat_rooms"), where("merchantId","==",merchantId), limit(1)),
      s => setRoom(s.empty ? null : { id:s.docs[0].id, ...s.docs[0].data() })
    );
  }, [merchantId]);
  return { room };
}

export async function sendMerchantMessage(roomId: string, text: string, merchantId: string, merchantName: string) {
  await addDoc(collection(db,"chat_rooms",roomId,"messages"), {
    senderId: merchantId, senderName: merchantName, senderRole:"merchant",
    text, createdAt: serverTimestamp(), read:false,
  });
  const snap = await getDoc(doc(db,"chat_rooms",roomId));
  await updateDoc(doc(db,"chat_rooms",roomId), {
    lastMessage: text, lastMessageAt: serverTimestamp(),
    unreadAdmin: (snap.data()?.unreadAdmin??0)+1,
    unreadMerchant: 0,
  });
}

// ── STORE PRODUCTS (merchant) ─────────────────────────────────
export function useMerchantStoreProducts(storeId: string | null) {
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db,"store_products"), where("storeId","==",storeId)),
      s => { setItems(s.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false); }
    );
  }, [storeId]);
  return { items, loading };
}
