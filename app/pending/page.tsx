import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "รออนุมัติ · ระบบใบเสนอราคาและใบแจ้งหนี้" };

async function PendingNotice() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "pending") redirect("/");
  return (
    <p className="mt-1.5 text-sm text-muted">
      บัญชี <span className="font-medium text-ink">{user.email}</span> สมัครเรียบร้อยแล้ว
      กรุณารอผู้ดูแลระบบ (Admin) อนุมัติสิทธิ์ แล้วเข้าสู่ระบบอีกครั้ง
    </p>
  );
}

export default function PendingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12 sm:px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark tone="solid" className="size-10" />
          <p className="font-semibold text-accent">เอกสารธุรกิจ</p>
        </div>
        <h1 className="text-2xl font-semibold text-accent">รอการอนุมัติ</h1>
        <Suspense>
          <PendingNotice />
        </Suspense>
        <form action={logout} className="mt-8">
          <button type="submit" className="btn">
            ออกจากระบบ
          </button>
        </form>
      </div>
    </main>
  );
}
