// Loads supabase/schema.sql into PGlite (in-process Postgres) for tests, with a small stand-in
// for the parts of Supabase it relies on: the auth schema, auth.uid() and the API roles.

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
`;

export async function openTestDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

/** Creates a Supabase auth user (the trigger adds the profile) and returns its id. */
export async function signUp(db: PGlite, email: string) {
  const id = crypto.randomUUID();
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    { full_name: email.split("@")[0] },
  ]);
  return id;
}

/**
 * Runs fn as an API request of the given user (role authenticated), like PostgREST does.
 * Pass null for an anonymous request.
 */
export async function as<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
