import { execSync } from "node:child_process";

const usesNetlifyMigrations =
  process.env.NETLIFY === "true" || process.env.CONTEXT === "production";

if (!usesNetlifyMigrations) {
  execSync("prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log("Netlify applies production SQL migrations before publishing; skipping Prisma migrate deploy.");
}

execSync("prisma generate", { stdio: "inherit" });
