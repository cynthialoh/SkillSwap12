"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref: string;
  label?: string;
};

export function BackButton({ fallbackHref, label = "Back" }: BackButtonProps) {
  const router = useRouter();

  function goBack() {
    let cameFromThisApp = false;
    if (typeof document !== "undefined" && document.referrer) {
      try {
        cameFromThisApp = new URL(document.referrer).origin === window.location.origin;
      } catch {
        cameFromThisApp = false;
      }
    }

    if (cameFromThisApp) {
      router.back();
      return;
    }

    router.replace(fallbackHref);
  }

  return (
    <button className="app-back-button" type="button" onClick={goBack}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="m14.5 5-7 7 7 7M8 12h12" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
