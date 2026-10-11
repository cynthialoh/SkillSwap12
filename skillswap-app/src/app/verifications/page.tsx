import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { requestVerification } from "./actions";

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const prisma = getPrismaClient();
  const [skills, requests] = await Promise.all([
    prisma.skillListing.findMany({
      where: { userId: member.id, direction: "TEACH", isActive: true },
      select: { id: true, name: true, verificationStatus: true },
      orderBy: { name: "asc" },
    }),
    prisma.verificationRequest.findMany({
      where: { userId: member.id },
      orderBy: { submittedAt: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        status: true,
        statement: true,
        evidenceObjectKey: true,
        submittedAt: true,
        reviewedAt: true,
      },
    }),
  ]);
  const notices: Record<string, string> = {
    "evidence-uploaded": "Private evidence uploaded successfully.",
    "invalid-evidence": "Choose a PDF, PNG, JPG, or WebP file up to 8 MB.",
    "request-not-uploadable": "This request is no longer awaiting evidence.",
    "storage-unavailable":
      "Private evidence storage is not configured or could not be reached. Your request remains saved.",
  };
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/member">
        ← Member workspace
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">VERIFICATION</p>
        <h1>Build trust with verification</h1>
        <p>
          Request a general Member badge or verify one of your active teaching skills. Evidence is
          stored privately in Cloudflare R2, reviewed only by authorized Admins, and scheduled for
          deletion 90 days after the decision unless an appeal or legal hold applies.
        </p>
        {params.notice && notices[params.notice] && (
          <p
            className={params.notice === "evidence-uploaded" ? "success-notice" : "privacy-notice"}
          >
            {notices[params.notice]}
          </p>
        )}
        <h2>Verify your identity</h2>
        <form action={requestVerification} className="interaction-form">
          <input type="hidden" name="kind" value="IDENTITY" />
          <label>
            What should the Admin know?
            <textarea
              name="statement"
              minLength={20}
              maxLength={700}
              rows={3}
              required
              placeholder="Briefly explain what you are asking us to verify."
            />
          </label>
          <button className="secondary-button">Request identity verification</button>
        </form>
        <h2>Verify a teaching skill</h2>
        {skills.length ? (
          <form action={requestVerification} className="interaction-form">
            <input type="hidden" name="kind" value="SKILL" />
            <label>
              Teaching skill
              <select name="skillListingId" required defaultValue="">
                <option value="" disabled>
                  Choose a skill
                </option>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name} · {skill.verificationStatus.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What should the Admin know?
              <textarea
                name="statement"
                minLength={20}
                maxLength={700}
                rows={3}
                required
                placeholder="Describe your experience and the evidence you can provide."
              />
            </label>
            <button className="secondary-button">Request skill verification</button>
          </form>
        ) : (
          <p className="empty-state">
            Add an active teaching skill before requesting skill verification.
          </p>
        )}
      </section>
      <section className="interaction-panel">
        <h2>Your requests</h2>
        {requests.length ? (
          <ul className="audit-list">
            {requests.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.kind === "SKILL" ? "Skill" : "Identity"} verification ·{" "}
                  {item.status.toLowerCase().replaceAll("_", " ")}
                </strong>
                <p>{item.statement}</p>
                <p>
                  {item.evidenceObjectKey ? "Private evidence attached" : "No evidence attached"} ·
                  submitted {item.submittedAt.toLocaleDateString()}
                </p>
                {item.status === "PENDING" && !item.evidenceObjectKey && (
                  <form
                    action="/api/verification/evidence"
                    method="post"
                    encType="multipart/form-data"
                    className="interaction-form"
                  >
                    <input type="hidden" name="requestId" value={item.id} />
                    <label>
                      Private supporting evidence (PDF, PNG, JPG, WebP; max 8 MB)
                      <input
                        type="file"
                        name="evidence"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        required
                      />
                    </label>
                    <button className="text-button">Upload private evidence</button>
                  </form>
                )}
                {item.reviewedAt && (
                  <p>
                    Decision recorded {item.reviewedAt.toLocaleDateString()}. An Admin’s internal
                    review note stays private.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">You have no verification requests.</p>
        )}
      </section>
    </main>
  );
}
