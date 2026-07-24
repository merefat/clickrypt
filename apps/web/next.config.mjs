/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@clickrypt/crypto"],
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:4001"}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
