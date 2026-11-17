// Server Component: reads the signed-in account, then renders the client-side menu.
// Reads the session cookies, so render it under <Suspense> (with no fallback that uses Nav,
// because Nav reads the URL and cannot be prerendered).
import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";

export async function RoleNav() {
  const user = await getCurrentUser();
  return <Nav superAdmin={user?.superAdmin ?? false} />;
}
