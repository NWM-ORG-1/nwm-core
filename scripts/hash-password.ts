/**
 * Prints an ADMIN_USERS entry: `npm run hash-password -- <login> <password>`
 * Multiple users are joined with ";".
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/credentials";

const [login, password] = process.argv.slice(2);
if (!login || !password || password.length < 10) {
  console.error("usage: npm run hash-password -- <login> <password(≥10 chars)>");
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`${login}:${salt.toString("hex")}:${hashPassword(password, salt).toString("hex")}`);
