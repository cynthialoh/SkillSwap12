import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { createLearningRequest } from "../actions";

export default async function NewLearningRequestPage() {
  const member = await requireMemberPage();
  const skills = await getPrismaClient().skillListing.findMany({
    where: { userId: member.id, direction: "LEARN", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/requests">
        ← Learning requests
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">ASK THE COMMUNITY</p>
        <h1>Post a learning request</h1>
        <p>Describe what you need help learning. Your request stays open until you close it.</p>
        {!skills.length ? (
          <div className="empty-state">
            <p>Add a skill to your “Want to learn” list first.</p>
            <Link href="/profile/edit">Update my profile</Link>
          </div>
        ) : (
          <form action={createLearningRequest} className="interaction-form">
            <label>
              Skill you want to learn
              <select name="skillListingId" required>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Request title
              <input
                name="title"
                minLength={5}
                maxLength={120}
                required
                placeholder="I want to learn Excel dashboards"
              />
            </label>
            <label>
              What would you like help with?
              <textarea
                name="scope"
                minLength={10}
                maxLength={1000}
                rows={4}
                required
                placeholder="Share your current level and the topics you want to cover."
              />
            </label>
            <label>
              What do you hope to do afterward?
              <textarea
                name="expectedOutcome"
                minLength={5}
                maxLength={500}
                rows={3}
                required
                placeholder="Describe a practical outcome."
              />
            </label>
            <button className="primary-button">Post request</button>
          </form>
        )}
      </section>
    </main>
  );
}
