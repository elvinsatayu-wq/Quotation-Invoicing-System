// Mock authentication storage: local users and session tokens in SQLite.
// Good enough for trying the app on localhost; not a production auth system.

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./tx.ts";

export type User = { id: string; email: string; name: string };

export const SESSION_DAYS = 7;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function createUser(db: Db, email: string, name: string, password: string) {
  const id = randomUUID();
  db.prepare("insert into users (id, email, name, password_hash) values (?, ?, ?, ?)").run(
    id,
    email,
    name,
    hashPassword(password),
  );
  return id;
}

export function checkCredentials(db: Db, email: string, password: string): User | null {
  const row = db.prepare("select * from users where email = ?").get(email.trim()) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, name: row.name };
}

// Only a hash of the token is stored, so the database alone cannot be used to log in.
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare("delete from sessions where expires_at < ?").run(new Date().toISOString());
  db.prepare("insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)").run(
    tokenHash(token),
    userId,
    expires.toISOString(),
  );
  return { token, expires };
}

export function getSessionUser(db: Db, token: string): User | null {
  const row = db
    .prepare(
      `select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`,
    )
    .get(tokenHash(token), new Date().toISOString());
  return row ? ({ ...row } as User) : null;
}

export function deleteSession(db: Db, token: string) {
  db.prepare("delete from sessions where token_hash = ?").run(tokenHash(token));
}
