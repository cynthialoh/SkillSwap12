import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { updateLearningRequest } from "../../actions";

export default async function EditLearningRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireMemberPage();
  const { id } = await params;
  const [request, skills] = await Promise.all([
    getPrismaClient().learningRequest.findFirst({
      where: { id, ownerId: member.id, status: "OPEN" },
    }),
    getPrismaClient().skillListing.findMany({
      where: { userId: member.id, direction: "LEARN", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!request) notFound();
  return (
    <main className="interaction-page">
      <Link className="text-link" href={"/requests/" + id}>
        ← Request
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">EDIT OPEN REQUEST</p>
        <h1>Update your learning request</h1>
        <form action={updateLearningRequest} className="interaction-form">
          <input type="hidden" name="requestId" value={id} />
          <label>
            Skill
            <select name="skillListingId" defaultValue={request.skillListingId ?? ""}>
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
              defaultValue={request.title}
            />
          </label>
          <label>
            What do you want help with?
            <textarea
              name="scope"
              minLength={10}
              maxLength={1000}
              rows={4}
              required
              defaultValue={request.scope}
            />
          </label>
          <label>
            Expected outcome
            <textarea
              name="expectedOutcome"
              minLength={5}
              maxLength={500}
              rows={3}
              required
              defaultValue={request.expectedOutcome}
            />
          </label>
          <button className="primary-button">Save changes</button>
        </form>
      </section>
    </main>
  );
}
