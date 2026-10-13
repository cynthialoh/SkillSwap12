"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/member", icon: "⌂", label: "Overview" },
  { href: "/discover", icon: "⌕", label: "Discover" },
  { href: "/profile/edit", icon: "✳", label: "My skills" },
  { href: "/exchanges", icon: "⇄", label: "Exchanges" },
  { href: "/connections", icon: "▤", label: "Chat" },
  { href: "/wallet", icon: "◉", label: "Credits" },
  { href: "/saved", icon: "♡", label: "Saved" },
  { href: "/notifications", icon: "♧", label: "Alerts" },
];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="member-nav-badge">{count > 99 ? "99+" : count}</span>;
}

export function MemberAppNavigation({
  unreadMessages,
  unreadNotifications,
}: {
  unreadMessages: number;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  return (
    <nav className="member-bottom-nav" aria-label="Member navigation">
      {links.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const badgeCount =
          item.href === "/connections"
            ? unreadMessages
            : item.href === "/notifications"
              ? unreadNotifications
              : 0;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "active" : undefined}
            href={item.href}
            key={item.href}
          >
            <span className="member-bottom-nav-icon" aria-hidden="true">
              {item.icon}
              <Badge count={badgeCount} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
