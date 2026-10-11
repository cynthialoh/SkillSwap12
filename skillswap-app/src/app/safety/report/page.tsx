import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { createSafetyReport } from "@/app/messages/actions";

export default async function SafetyReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    reportedUserId?: string;
    conversationId?: string;
    messageId?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const reportedUserId = params.reportedUserId ?? "";
  if (reportedUserId === member.id)
    return (
      <main className="interaction-page">
        <p className="error-notice">You cannot report your own account.</p>
        <Link href="/member">Return to workspace</Link>
      </main>
    );
  return (
    <main className="interaction-page">
      <Link
        className="text-link"
        href={params.conversationId ? "/messages/" + params.conversationId : "/member"}
      >
        ← Back
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">PRIVATE SAFETY REPORT</p>
        <h1>Report a concern</h1>
        {params.notice && <p className="success-notice">{params.notice}</p>}
        {params.error && <p className="error-notice">{params.error}</p>}
        <p>
          Your report is visible to authorized Admins for safety review. The reported member will
          not see your report details.
        </p>
        <form action={createSafetyReport} className="interaction-form">
          <input type="hidden" name="reportedUserId" value={reportedUserId} />
          <input type="hidden" name="conversationId" value={params.conversationId ?? ""} />
          <input type="hidden" name="messageId" value={params.messageId ?? ""} />
          <label>
            Reason
            <select name="category" required>
              <option value="">Choose a reason</option>
              <option value="HARASSMENT">Harassment or abuse</option>
              <option value="SCAM">Scam or fraud</option>
              <option value="INAPPROPRIATE_CONTENT">Inappropriate content</option>
              <option value="SAFETY">Safety concern</option>
              <option value="SPAM">Spam</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            What happened?
            <textarea
              name="details"
              minLength={20}
              maxLength={2000}
              rows={6}
              required
              placeholder="Include the relevant details and when it happened."
            />
          </label>
          <label>
            Additional context (optional)
            <textarea
              name="context"
              maxLength={1000}
              rows={3}
              placeholder="Add anything else that may help the safety team review the report."
            />
          </label>
          <p className="form-hint">
            You can attach a conversation or message as context. File evidence upload will be added
            with the private R2 evidence workflow.
          </p>
          <button className="primary-button">Submit private report</button>
        </form>
      </section>
    </main>
  );
}
