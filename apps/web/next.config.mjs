/** @type {import('next').NextConfig} */
const apiUrl = (process.env.API_URL ?? "http://localhost:8081").replace(/\/+$/, "");

const nextConfig = {
  transpilePackages: ["@clickrypt/crypto"],
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
