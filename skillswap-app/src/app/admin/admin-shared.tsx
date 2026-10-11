import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActor, requireAdmin } from "@/lib/dal";

export async function requireAdminPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (!actor.isAdmin || actor.status !== "ACTIVE") notFound();
  return requireAdmin();
}

const items = [
  ["Overview", "/admin"],
  ["Queues", "/admin/queues"],
  ["Community moderation", "/admin/community"],
  ["Members", "/admin/users"],
  ["Credit codes", "/admin/credit-codes"],
  ["Catalog", "/admin/catalog"],
  ["Sessions", "/admin/sessions"],
  ["Metrics", "/admin/metrics"],
  ["Audit log", "/admin/audit"],
  ["Trust & verification", "/admin/trust"],
] as const;

export function AdminNavigation({ current }: { current: string }) {
  return (
    <nav className="admin-navigation" aria-label="Admin sections">
      {items.map(([label, href]) => (
        <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="admin-page-header">
      <p className="section-kicker">PROTECTED OPERATIONS</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
