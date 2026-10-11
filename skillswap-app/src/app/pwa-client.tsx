"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaClient() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setIsStandalone(standalone);
    setIsIos(
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
        (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1),
    );

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsStandalone(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsStandalone(true);
    setInstallPrompt(null);
  }

  if (isStandalone || dismissed || (!installPrompt && !isIos)) return null;

  return (
    <aside className="pwa-install-card" aria-label="Install SkillSwap">
      <div className="pwa-install-copy">
        <strong>Take SkillSwap with you</strong>
        {isIos && !installPrompt ? (
          <p>Tap Share, then “Add to Home Screen” to install SkillSwap.</p>
        ) : (
          <p>Install SkillSwap for quick access from your device.</p>
        )}
      </div>
      {installPrompt && (
        <button className="pwa-install-button" onClick={installApp} type="button">
          Install
        </button>
      )}
      <button
        aria-label="Dismiss install suggestion"
        className="pwa-install-dismiss"
        onClick={() => setDismissed(true)}
        type="button"
      >
        ×
      </button>
    </aside>
  );
}
