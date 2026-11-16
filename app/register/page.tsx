import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = { title: "สมัครใช้งาน · ระบบใบเสนอราคาและใบแจ้งหนี้" };

export default function RegisterPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12 sm:px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark tone="solid" className="size-10" />
          <p className="font-semibold text-accent">เอกสารธุรกิจ</p>
        </div>

        <h1 className="text-2xl font-semibold text-accent">สมัครใช้งาน</h1>
        <p className="mt-1.5 text-sm text-muted">
          บัญชีแรกของระบบจะเป็นผู้ดูแลระบบ (Admin) บัญชีถัดไปต้องรอผู้ดูแลอนุมัติก่อนใช้งาน
        </p>

        <div className="mt-8">
          <RegisterForm />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          มีบัญชีแล้ว?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </main>
  );
}
