"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  name: string;
  initialGreeting: string;
  timeZone?: string;
  profileImageUrl?: string;
};

function greetingForCurrentHour(timeZone?: string) {
  const useProfileZone = Boolean(timeZone && timeZone !== "UTC");
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      ...(useProfileZone ? { timeZone } : {}),
    }).format(new Date()),
  );
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function TimeOfDayGreeting({ name, initialGreeting, timeZone, profileImageUrl }: Props) {
  const [greeting, setGreeting] = useState(initialGreeting);

  useEffect(() => {
    const update = () => setGreeting(greetingForCurrentHour(timeZone));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  return (
    <h1>
      {greeting},{" "}
      <Link
        className="member-greeting-profile-link"
        href="/profile/edit"
        aria-label="Open your profile"
      >
        {name}
      </Link>
      <Link
        className="member-greeting-avatar-link"
        href="/profile/edit#profile-picture"
        aria-label="Upload or change your profile picture"
        title="Upload or change your profile picture"
      >
        {profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileImageUrl} alt="" />
        ) : null}
      </Link>
    </h1>
  );
}
