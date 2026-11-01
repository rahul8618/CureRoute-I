import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  transpilePackages: ["react-leaflet", "leaflet"],
};

export default nextConfig;
