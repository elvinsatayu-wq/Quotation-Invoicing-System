import { Suspense, type ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { RoleNav } from "@/components/role-nav";
import { UserMenu } from "@/components/user-menu";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="flex flex-col bg-accent text-white lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-5 lg:pt-6 lg:pb-6">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-9" />
            <div className="leading-tight">
              <p className="font-semibold">เอกสารธุรกิจ</p>
              <p className="text-xs text-white/60">ใบเสนอราคา · ใบแจ้งหนี้</p>
            </div>
          </div>
          <div className="lg:hidden">
            <Suspense>
              <UserMenu compact />
            </Suspense>
          </div>
        </div>
        <p className="hidden px-6 pb-2 text-xs leading-6 font-medium text-white/50 lg:block">เมนูหลัก</p>
        <Suspense>
          <RoleNav />
        </Suspense>
        <div className="mx-3 mt-auto mb-3 hidden rounded-xl bg-white/[0.07] px-4 py-3.5 lg:block">
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
