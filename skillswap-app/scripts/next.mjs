import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nextCli = resolve(projectRoot, "node_modules/next/dist/bin/next");
const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error("Expected a Next.js command such as dev, build, or start.");
}

process.env.NEXT_SWC_PATH ??= resolve(projectRoot, ".swc-cache");

const result = spawnSync(process.execPath, [nextCli, command, ...args], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
