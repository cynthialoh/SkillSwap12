"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { respondToTimeProposal } from "@/app/sessions/actions";

type Notice = { id: string; title: string; body: string; href: string };

export function MemberActivityPoller({ initialCursor }: { initialCursor: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const cursor = useRef(initialCursor);
  const seen = useRef(new Set<string>());
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/member-notifications?since=${encodeURIComponent(cursor.current)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { notices: Notice[]; latest: string | null };
        if (!active) return;
        const fresh = data.notices.filter((notice) => !seen.current.has(notice.id));
        for (const notice of data.notices) seen.current.add(notice.id);
        if (data.latest) cursor.current = data.latest;
        if (fresh.length) {
          setNotices((current) => [...fresh, ...current].slice(0, 3));
          router.refresh();
        }
      } catch {
        // A later poll retries when the device is offline or the network is unavailable.
      }
    };
    void poll();
    const timer = window.setInterval(poll, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [router]);

  if (!notices.length) return null;
  return (
    <aside className="member-activity-toasts" aria-label="New activity" aria-live="polite">
      {notices.map((notice) => (
        <article className="member-activity-toast" key={notice.id}>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.body}</p>
            {notice.title === "New session request" ? (
              <div className="session-request-toast-actions">
                <Link
                  className="primary-button"
                  href={notice.href}
                  onClick={() => setNotices((items) => items.filter((item) => item.id !== notice.id))}
                >
                  Review request
                </Link>
                <Link
                  className="secondary-button"
                  href={`${notice.href}?adjust=1`}
                  onClick={() => setNotices((items) => items.filter((item) => item.id !== notice.id))}
                >
                  Adjust time
                </Link>
                <form action={respondToTimeProposal}>
                  <input type="hidden" name="sessionId" value={notice.href.split("/").at(-1)} />
                  <button className="primary-button" name="decision" value="ACCEPT">
                    Confirm
                  </button>
                </form>
                <form action={respondToTimeProposal}>
                  <input type="hidden" name="sessionId" value={notice.href.split("/").at(-1)} />
                  <button className="toast-text-button" name="decision" value="DECLINE">
                    Decline
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href={notice.href}
                onClick={() => setNotices((items) => items.filter((item) => item.id !== notice.id))}
              >
                Open
              </Link>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotices((items) => items.filter((item) => item.id !== notice.id))}
          >
            ×
          </button>
        </article>
      ))}
    </aside>
  );
}
