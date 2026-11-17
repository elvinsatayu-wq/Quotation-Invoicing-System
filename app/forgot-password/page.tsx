import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { ErrorNote } from "@/components/ui";
import { ForgotPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน · ระบบใบเสนอราคาและใบแจ้งหนี้" };

/** Shown when a reset link from an earlier email has expired or was already used. */
async function ExpiredNotice({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  if (!expired) return null;
  return (
    <div className="mb-4">
      <ErrorNote message="ลิงก์เปลี่ยนรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่" />
    </div>
  );
}

export default function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12 sm:px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark tone="solid" className="size-10" />
          <p className="font-semibold text-accent">เอกสารธุรกิจ</p>
        </div>

        <h1 className="text-2xl font-semibold text-accent">ลืมรหัสผ่าน</h1>
        <p className="mt-1.5 text-sm text-muted">กรอกอีเมลที่ใช้เข้าสู่ระบบ ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p>

        <div className="mt-8">
          <Suspense>
            <ExpiredNotice searchParams={searchParams} />
          </Suspense>
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          จำรหัสผ่านได้แล้ว?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}
