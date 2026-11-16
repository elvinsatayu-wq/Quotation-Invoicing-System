// Mock auth for local use: a demo user in SQLite and an httpOnly session cookie.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "./server/db";
import { getSessionUser, type User } from "./server/users";

export const SESSION_COOKIE = "qi_session";

/** The signed-in user, or null. Reads the request cookie, so call it under <Suspense>. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Session expiry and "today" depend on the clock, so render this at request time.
  await connection();
  return token ? getSessionUser(db(), token) : null;
});

/** The signed-in user; anyone else is sent to the login page. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
