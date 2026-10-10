import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // Optional @x402/* peers of @coinbase/cdp-sdk (via RainbowKit's Base Account
    // connector) are never used by Contribo; point them at a stub so builds resolve.
    resolveAlias: Object.fromEntries(
      [
        "@x402/core/client",
        "@x402/core/schemas",
        "@x402/core/server",
        "@x402/evm",
        "@x402/evm/auth-capture/client",
        "@x402/evm/batch-settlement/client",
        "@x402/evm/exact/client",
        "@x402/evm/exact/server",
        "@x402/evm/exact/v1/client",
        "@x402/evm/upto/client",
        "@x402/evm/upto/server",
        "@x402/express",
        "@x402/extensions/bazaar",
        "@x402/extensions/builder-code",
        "@x402/fetch",
        "@x402/svm/exact/client",
        "@x402/svm/exact/server",
        "@x402/svm/exact/v1/client",
        "@x402/svm/upto/client",
        "@x402/svm/upto/server",
      ].map((specifier) => [specifier, "./src/lib/stubs/x402-unavailable.ts"]),
    ),
  },
};

export default nextConfig;
