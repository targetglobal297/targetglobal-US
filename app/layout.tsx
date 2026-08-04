// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = { title:"TargetGlobal — Merchant", description:"Your dropshipping store" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }:{children:React.ReactNode}) {
  return (
    <html lang="en"><body>{children}
      <Toaster position="top-center" toastOptions={{ duration:3500,
        style:{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,fontWeight:600} }}/>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; }
        html, body { overflow-x:hidden; max-width:100vw; -webkit-text-size-adjust:100%; }
        input, select, textarea { font-size:16px; }
        a, button, label, input, select, textarea { -webkit-tap-highlight-color:transparent; }
        img, svg, video { max-width:100%; height:auto; }
      `}</style>
    </body></html>
  );
}
