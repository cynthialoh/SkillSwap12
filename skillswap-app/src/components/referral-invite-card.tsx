"use client";

import { useState } from "react";

export function ReferralInviteCard({
  code,
  completedInvites,
  referralUrl,
}: {
  code: string;
  completedInvites: number;
  referralUrl: string;
}) {
  const [message, setMessage] = useState("");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setMessage("Referral link copied. Send it to a friend!");
    } catch {
      setMessage("Select the link above and copy it to share with a friend.");
    }
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: "Join me on SkillSwap",
        text: "Join SkillSwap to teach a skill or learn something new. We both earn credits when your profile is complete.",
        url: referralUrl,
      });
      setMessage("Invite shared.");
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setMessage("We could not open sharing. Copy your link instead.");
      }
    }
  }

  return (
    <section className="referral-invite-card" aria-labelledby="referral-invite-title">
      <div className="referral-invite-copy">
        <span className="section-kicker">GROW THE COMMUNITY</span>
        <h2 id="referral-invite-title">Invite a friend</h2>
        <p>
          Your friend receives 4 profile-completion credits. You receive 3 referral credits when
          they finish their profile.
        </p>
        {completedInvites > 0 && (
          <p className="referral-earned-summary">
            You’ve earned {completedInvites * 3} credits from {completedInvites} completed{" "}
            {completedInvites === 1 ? "invite" : "invites"}.
          </p>
        )}
      </div>
      <label className="referral-link-label">
        Your personal invite link
        <input
          aria-label="Your personal invite link"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={referralUrl}
        />
      </label>
      <div className="referral-invite-actions">
        <button className="secondary-button" onClick={copyLink} type="button">
          Copy link
        </button>
        <button className="button-primary" onClick={shareLink} type="button">
          Share invite
        </button>
      </div>
      {message && (
        <p className="referral-share-status" role="status">
          {message}
        </p>
      )}
      <span className="referral-code-hint">Invite code: {code}</span>
    </section>
  );
}
