import type { Metadata } from "next";
import { BrandMark } from "@/components/brand";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่ · ระบบใบเสนอราคาและใบแจ้งหนี้" };

/**
 * Opened from the reset link: /auth/callback has already signed the user in, so this page
 * only sets the new password. Signed-out visitors are sent to /login by the proxy.
 */
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12 sm:px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark tone="solid" className="size-10" />
          <p className="font-semibold text-accent">เอกสารธุรกิจ</p>
        </div>

        <h1 className="text-2xl font-semibold text-accent">ตั้งรหัสผ่านใหม่</h1>
        <p className="mt-1.5 text-sm text-muted">กรอกรหัสผ่านใหม่ที่ต้องการใช้เข้าสู่ระบบ</p>

        <div className="mt-8">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
