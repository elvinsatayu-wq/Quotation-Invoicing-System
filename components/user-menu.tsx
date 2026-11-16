import { getCurrentUser, ROLE_LABEL } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";

/** Signed-in user and logout button, styled for the navy sidebar. Reads the session, so render it under <Suspense>. */
export async function UserMenu({ compact }: { compact?: boolean }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const button = (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-md px-2 py-1 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        ออกจากระบบ
      </button>
    </form>
  );

  if (compact) return button;
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-white/60">{user.email}</p>
        <p className="truncate text-xs text-white/60">{ROLE_LABEL[user.role]}</p>
        <div className="-ml-2 mt-1">{button}</div>
      </div>
    </div>
  );
}
