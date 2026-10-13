"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);
  const hasInAppHistory = useRef(false);

  useEffect(() => {
    if (lastPathname.current && lastPathname.current !== pathname) {
      hasInAppHistory.current = true;
    }
    lastPathname.current = pathname;
  }, [pathname]);

  function getFallbackHref() {
    if (pathname === "/") return "/sign-in";
    if (pathname === "/member") return "/";
    if (pathname === "/admin") return "/member";
    if (pathname.startsWith("/admin/")) return "/admin";
    if (["/sign-in", "/sign-up", "/onboarding"].includes(pathname)) return "/";
    return "/member";
  }

  function goBack() {
    let cameFromThisApp = false;
    if (typeof document !== "undefined" && document.referrer) {
      try {
        cameFromThisApp = new URL(document.referrer).origin === window.location.origin;
      } catch {
        cameFromThisApp = false;
      }
    }

    if (cameFromThisApp || hasInAppHistory.current) {
      router.back();
      return;
    }

    router.replace(getFallbackHref());
  }

  return (
    <button className="app-back-button" type="button" onClick={goBack}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="m14.5 5-7 7 7 7M8 12h12" />
      </svg>
      <span>Back</span>
    </button>
  );
}
