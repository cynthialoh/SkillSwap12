"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "unsupported" | "disabled" | "enabled" | "blocked";

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0));
}

export function PushNotificationSettings() {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (active) setState("unsupported");
        return;
      }
      const permission = Notification.permission;
      if (!active) return;
      if (permission === "denied") {
        setState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setState(subscription ? "enabled" : "disabled");
    })().catch(() => {
      if (active) setState("unsupported");
    });
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setMessage("Push notifications are not configured on the server yet.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "disabled");
        setMessage("Allow notifications for SkillSwap in your browser settings to continue.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error("SkillSwap could not save this device subscription.");
      setState("enabled");
      setMessage("This device will receive session request notifications, including when SkillSwap is closed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("disabled");
      setMessage("Notifications are turned off on this device.");
    } catch {
      setMessage("Could not turn off notifications on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="push-notification-settings">
      <div>
        <strong>Session notifications on this device</strong>
        <small>
          {state === "enabled"
            ? "Enabled for session requests, even when the app is closed."
            : state === "unsupported"
              ? "This browser does not support push notifications."
              : state === "blocked"
                ? "Notifications are blocked in your browser settings."
                : "Allow notifications so you can respond to session requests promptly."}
        </small>
      </div>
      {state === "enabled" ? (
        <button className="secondary-button" disabled={busy} onClick={disable} type="button">
          {busy ? "Saving…" : "Turn off on this device"}
        </button>
      ) : (
        <button
          className="primary-button"
          disabled={busy || state === "checking" || state === "unsupported" || state === "blocked"}
          onClick={enable}
          type="button"
        >
          {busy ? "Enabling…" : "Enable notifications"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
