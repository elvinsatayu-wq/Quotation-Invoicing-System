import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export const metadata: Metadata = { title: "เข้าสู่ระบบ · ระบบใบเสนอราคาและใบแจ้งหนี้" };

/** Already signed in? Go straight to the dashboard. */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}

const FEATURES = [
  "ออกใบเสนอราคา ใบแจ้งหนี้ ใบกำกับภาษี และใบเสร็จได้ในที่เดียว",
  "คำนวณ VAT และหัก ณ ที่จ่ายให้อัตโนมัติ",
  "ติดตามยอดรอเก็บเงินและใบแจ้งหนี้เกินกำหนด",
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-surface lg:grid-cols-2">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>

      <section className="relative hidden overflow-hidden bg-accent p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 size-96 rounded-full bg-white/[0.06]"
        />
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-white/[0.04]" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="size-11" />
          <p className="text-lg font-semibold">เอกสารธุรกิจ</p>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-snug font-semibold">
            จัดการเอกสารการขาย
            <br />
            ให้ง่ายและเป็นระบบ
          </h2>
          <ul className="mt-8 grid gap-4">
            {FEATURES.map((text) => (
              <li key={text} className="flex gap-3 text-white/85">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
                    <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">ระบบใบเสนอราคาและใบแจ้งหนี้</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark tone="solid" className="size-10" />
            <p className="font-semibold text-accent">เอกสารธุรกิจ</p>
          </div>

          <h1 className="text-2xl font-semibold text-accent">ยินดีต้อนรับ</h1>
          <p className="mt-1.5 text-sm text-muted">เข้าสู่ระบบเพื่อจัดการเอกสารของคุณ</p>

          <div className="mt-8">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            ยังไม่มีบัญชี?{" "}
            <Link href="/register" className="font-medium text-accent hover:underline">
              สมัครใช้งาน
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
