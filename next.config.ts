import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "anexos.tiny.com.br",
      },
      {
        protocol: "https",
        hostname: "loremflickr.com",
      },
    ],
  },
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.next/**",
        "**/.git/**",
        "**/.agents/**",
        "**/.codex/**",
        "**/.vscode/**",
        "**/prisma/migrations/**",
        "**/src/generated/**",
        "**/*.zip",
      ],
    };

    return config;
  },
};

export default nextConfig;
