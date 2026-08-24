import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@messanga11/core", "@messanga11/project-fixture"],
};

export default config;
