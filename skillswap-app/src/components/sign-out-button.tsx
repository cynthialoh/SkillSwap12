"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="button button-secondary"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/");
        router.refresh();
      }}
      type="button"
    >
      Sign out
    </button>
  );
}
