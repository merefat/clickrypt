import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import swc from "unplugin-swc";

loadEnv({ path: ".env" });
process.env.NODE_ENV = "test";

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "test/**/*.test.ts"],
  },
});
