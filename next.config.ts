import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Enables Cloudflare bindings during `next dev` (OpenNext Workers adapter).
initOpenNextCloudflareForDev();
