import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://nwm:nwm@127.0.0.1:5432/nwm",
  },
  strict: true,
  verbose: true,
});
