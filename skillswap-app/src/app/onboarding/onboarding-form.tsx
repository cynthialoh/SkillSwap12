"use client";

import { useActionState } from "react";
import { saveOnboarding } from "./actions";

export function OnboardingForm({
  name,
  profile,
}: {
  name: string;
  profile?: {
    displayName: string | null;
    bio: string | null;
    location: string | null;
    timezone: string;
    teachSkills: string[];
    learnSkills: string[];
    availability: unknown;
    isDiscoverable: boolean;
  } | null;
}) {
  const [state, action, pending] = useActionState(saveOnboarding, undefined);
  const availability =
    profile?.availability &&
    typeof profile.availability === "object" &&
    "notes" in profile.availability
      ? String(profile.availability.notes ?? "")
      : "";

  return (
    <form action={action} className="onboarding-form">
      <label>
        What should we call you?
        <input
          name="displayName"
          defaultValue={profile?.displayName ?? name}
          minLength={2}
          maxLength={80}
          required
          autoComplete="name"
        />
      </label>
      <div className="form-row">
        <label>
          Location <span>(optional)</span>
          <input
            name="location"
            defaultValue={profile?.location ?? ""}
            maxLength={120}
            placeholder="City or region"
            autoComplete="address-level2"
          />
        </label>
        <label>
          Time zone
          <input
            name="timezone"
            defaultValue={profile?.timezone ?? "UTC"}
            required
            maxLength={80}
            placeholder="Europe/London"
          />
        </label>
      </div>
      <label>
        About you <span>(optional)</span>
        <textarea
          name="bio"
          defaultValue={profile?.bio ?? ""}
          rows={3}
          maxLength={500}
          placeholder="Tell the community what you enjoy learning and sharing."
        />
      </label>
      <div className="form-row">
        <label>
          Skills I can teach <span>(comma separated)</span>
          <input
            name="teachSkills"
            defaultValue={profile?.teachSkills.join(", ") ?? ""}
            placeholder="Photography, Excel, guitar"
          />
        </label>
        <label>
          Skills I want to learn <span>(comma separated)</span>
          <input
            name="learnSkills"
            defaultValue={profile?.learnSkills.join(", ") ?? ""}
            placeholder="Public speaking, Spanish"
          />
        </label>
      </div>
      <label>
        When are you usually available? <span>(optional)</span>
        <textarea
          name="availability"
          defaultValue={availability}
          rows={2}
          placeholder="Weekday evenings, Saturday mornings…"
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="isDiscoverable"
          defaultChecked={profile?.isDiscoverable ?? true}
        />
        <span>
          <strong>Show me in SkillSwap discovery</strong>
          <small>You can change this preference later.</small>
        </span>
      </label>
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>
        {pending ? "Saving your profile…" : "Save and continue"}
      </button>
    </form>
  );
}
