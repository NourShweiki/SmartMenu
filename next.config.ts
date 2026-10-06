import path from "node:path";
import type { NextConfig } from "next";

// next-intl reads its per-request config through the `next-intl/config` alias.
// We set that alias here instead of using `next-intl/plugin`: the plugin always loads a
// native @swc/core build (only needed for its experimental message extraction), and that
// binary refuses to run on Windows machines whose cache folders are writable by other
// users (as on our dev machines). Without the experimental options, the alias is all the
// plugin does. Re-check this if we upgrade next-intl or enable trailingSlash/basePath.
const I18N_REQUEST_CONFIG = "./src/interface/web/i18n/request.ts";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: { "next-intl/config": I18N_REQUEST_CONFIG },
  },
  webpack(config: { context: string; resolve: { alias: Record<string, string> } }) {
    config.resolve.alias["next-intl/config"] = path.resolve(config.context, I18N_REQUEST_CONFIG);
    return config;
  },
};

export default nextConfig;
