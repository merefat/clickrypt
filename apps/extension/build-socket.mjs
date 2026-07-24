import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

await build({
  entryPoints: [resolve(projectRoot, "node_modules", ".pnpm", "socket.io-client@4.8.3", "node_modules", "socket.io-client", "build", "esm", "index.js")],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: resolve(__dirname, "socket-bundle.js"),
  platform: "browser",
  absWorkingDir: projectRoot,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log("Extension socket.io bundle built → socket-bundle.js");
