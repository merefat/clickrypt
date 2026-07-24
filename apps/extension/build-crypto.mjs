import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

await build({
  entryPoints: [resolve(__dirname, "src", "index.ts")],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: resolve(__dirname, "crypto-bundle.js"),
  platform: "browser",
  absWorkingDir: projectRoot,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log("Extension crypto bundle built → crypto-bundle.js");
