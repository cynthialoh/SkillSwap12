"use client";

import { useEffect, useState } from "react";

type Props = {
  name: string;
  initialGreeting: string;
  timeZone?: string;
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

export function TimeOfDayGreeting({ name, initialGreeting, timeZone }: Props) {
  const [greeting, setGreeting] = useState(initialGreeting);

  useEffect(() => {
    const update = () => setGreeting(greetingForCurrentHour(timeZone));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  return (
    <h1>
      {greeting}, {name}
      <span aria-hidden="true"> ✦</span>
    </h1>
  );
}
