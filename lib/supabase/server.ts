// Supabase client for server components, server actions and route handlers. It acts as the
// signed-in user (session from the auth cookies), so row level security applies to every query.

import { createServerClient } from "@supabase/ssr";
import type { PostgrestError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AppError } from "../errors";
import { supabaseConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only. proxy.ts refreshes them.
        }
      },
    },
  });
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Turns a database error into an AppError when its message is meant for the user:
 * business rules raised by the schema's functions (P0001) and permission errors.
 */
export function dbError(error: PostgrestError): Error {
  if (error.code === "P0001") return new AppError(error.message);
  if (error.code === "42501") return new AppError("ไม่มีสิทธิ์ทำรายการนี้");
  if (error.code === "23505") return new AppError("ข้อมูลนี้มีอยู่แล้ว (ซ้ำกับรายการเดิม)");
  if (error.code === "23503") return new AppError("ลบไม่ได้ เพราะมีเอกสารอื่นอ้างอิงอยู่");
  return new Error(`Supabase: ${error.message} (${error.code})`);
}

/** Unwraps a query result, throwing on error. */
export function must<T>({ data, error }: { data: T; error: PostgrestError | null }): T {
  if (error) throw dbError(error);
  return data;
}
