// Supabase connection settings from .env.local (see .env.example).

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`ยังไม่ได้ตั้งค่า ${name} ใน .env.local (ดูตัวอย่างใน .env.example)`);
  }
  return value;
}

export function supabaseConfig() {
  return {
    // The client adds /rest/v1/ itself, so a pasted REST URL is trimmed back to the project URL.
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/rest\/v1\/?$/, ""),
    key: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}
