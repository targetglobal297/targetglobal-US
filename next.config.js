/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark firebase-admin as external so Next.js doesn't
  // try to bundle it — it must run in Node.js at runtime only
  serverExternalPackages: ["firebase-admin"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

module.exports = nextConfig;
