"use client";

import { useActionState } from "react";
import {
  saveSkillListing,
  updateProfileSettings,
  requestProfileAccess,
  type FormState,
} from "./actions";

function Status({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p className="form-feedback form-error" role="alert">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p className="form-feedback form-success" role="status">
        {state.success}
      </p>
    );
  return null;
}

export function ProfileSettingsForm({
  profile,
}: {
  profile: {
    displayName: string | null;
    bio: string | null;
    location: string | null;
    timezone: string;
    profileVisibility: "PUBLIC" | "PRIVATE";
    isDiscoverable: boolean;
    acceptLearningRequests: boolean;
    acceptDirectSwapRequests: boolean;
    acceptMessages: boolean;
    privacyReviewRequired: boolean;
  };
}) {
  const [state, action, pending] = useActionState(updateProfileSettings, {});
  return (
    <form action={action} className="profile-form">
      {profile.privacyReviewRequired && (
        <p className="privacy-notice">
          Your profile is visible as a basic preview until you review and save these privacy
          settings.
        </p>
      )}
      <label>
        Display name
        <input
          name="displayName"
          defaultValue={profile.displayName ?? ""}
          minLength={2}
          maxLength={80}
          required
        />
      </label>
      <label>
        About you
        <textarea name="bio" defaultValue={profile.bio ?? ""} maxLength={500} rows={4} />
      </label>
      <div className="form-row">
        <label>
          Location
          <input
            name="location"
            defaultValue={profile.location ?? ""}
            maxLength={120}
            placeholder="City or region"
          />
        </label>
        <label>
          Time zone
          <input
            name="timezone"
            defaultValue={profile.timezone}
            required
            placeholder="Europe/London"
          />
        </label>
      </div>
      <label>
        Profile visibility
        <select name="profileVisibility" defaultValue={profile.profileVisibility}>
          <option value="PUBLIC">Public profile</option>
          <option value="PRIVATE">Private with basic preview</option>
        </select>
      </label>
      <p className="form-hint">
        A private profile can still show your name, skills and trust details. You decide who can see
        the full profile.
      </p>
      <div className="toggle-list">
        <label>
          <input type="checkbox" name="isDiscoverable" defaultChecked={profile.isDiscoverable} />{" "}
          Allow my basic profile to appear in member discovery
        </label>
        <label>
          <input
            type="checkbox"
            name="acceptLearningRequests"
            defaultChecked={profile.acceptLearningRequests}
          />{" "}
          Accept learning requests
        </label>
        <label>
          <input
            type="checkbox"
            name="acceptDirectSwapRequests"
            defaultChecked={profile.acceptDirectSwapRequests}
          />{" "}
          Accept direct-swap recommendations
        </label>
        <label>
          <input type="checkbox" name="acceptMessages" defaultChecked={profile.acceptMessages} />{" "}
          Allow members to message me
        </label>
      </div>
      <Status state={state} />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile settings"}
      </button>
    </form>
  );
}

export function SkillListingForm({
  categories,
  listing,
}: {
  categories: { id: string; name: string }[];
  listing?: {
    id: string;
    direction: "TEACH" | "LEARN";
    name: string;
    categoryId: string;
    topics: string[];
    outcomes: string | null;
    experienceLevel: string;
    yearsExperience: number;
    priceCredits: number | null;
  };
}) {
  const [state, action, pending] = useActionState(saveSkillListing, {});
  return (
    <form action={action} className="profile-form skill-form">
      {listing && <input type="hidden" name="listingId" value={listing.id} />}
      <div className="form-row">
        <label>
          Skill
          <input
            name="name"
            defaultValue={listing?.name ?? ""}
            required
            minLength={2}
            maxLength={100}
            placeholder="e.g. Conversational Spanish"
          />
        </label>
        <label>
          Direction
          <select name="direction" defaultValue={listing?.direction ?? "TEACH"}>
            <option value="TEACH">I can teach</option>
            <option value="LEARN">I want to learn</option>
          </select>
        </label>
      </div>
      <label>
        Category
        <select name="categoryId" defaultValue={listing?.categoryId ?? categories[0]?.id} required>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Topics
        <input
          name="topics"
          defaultValue={listing?.topics.join(", ") ?? ""}
          placeholder="Beginner conversation, pronunciation"
        />
      </label>
      <label>
        Learning outcome
        <textarea
          name="outcomes"
          defaultValue={listing?.outcomes ?? ""}
          maxLength={500}
          rows={2}
          placeholder="What will a learner be able to do?"
        />
      </label>
      <div className="form-row">
        <label>
          Experience level
          <select name="experienceLevel" defaultValue={listing?.experienceLevel ?? "BEGINNER"}>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
            <option value="EXPERT">Expert</option>
          </select>
        </label>
        <label>
          Years of experience
          <input
            name="yearsExperience"
            type="number"
            min="0"
            max="80"
            defaultValue={listing?.yearsExperience ?? 0}
          />
        </label>
      </div>
      <label>
        Credit cost per session{" "}
        <span className="form-hint">(teaching skills only; leave blank to decide later)</span>
        <input
          name="priceCredits"
          type="number"
          min="0"
          max="1000"
          defaultValue={listing?.priceCredits ?? ""}
        />
      </label>
      <Status state={state} />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : listing ? "Update skill" : "Add skill"}
      </button>
    </form>
  );
}

export function AccessRequestForm({ ownerId }: { ownerId: string }) {
  const [state, action, pending] = useActionState(requestProfileAccess, {});
  return (
    <form action={action} className="profile-form access-request-form">
      <input type="hidden" name="ownerId" value={ownerId} />
      <label>
        Why would you like access?
        <textarea
          name="reason"
          rows={3}
          maxLength={500}
          placeholder="A short note to the profile owner"
        />
      </label>
      <Status state={state} />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Request full profile access"}
      </button>
    </form>
  );
}
