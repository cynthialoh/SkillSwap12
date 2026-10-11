"use client";

import { useActionState } from "react";
import { createAdminCreditCode, type CreditCodeFormState } from "./credit-code-actions";

const initialState: CreditCodeFormState = { status: "idle", message: "" };

export function CreditCodeForm() {
  const [state, action, pending] = useActionState(createAdminCreditCode, initialState);
  return (
    <form action={action} className="interaction-form admin-credit-code-form">
      <div className="admin-credit-code-fields">
        <label>
          Credits per redemption
          <input name="amount" type="number" min={1} max={100000} defaultValue={5} required />
        </label>
        <label>
          Maximum redemptions
          <input
            name="maxRedemptions"
            type="number"
            min={1}
            max={100000}
            defaultValue={1}
            required
          />
        </label>
        <label>
          Expiry (optional)
          <input name="expiresAt" type="datetime-local" />
        </label>
      </div>
      <label>
        Admin reason
        <textarea
          name="reason"
          minLength={20}
          maxLength={500}
          rows={3}
          placeholder="Explain why these credits are being awarded."
          required
        />
      </label>
      <button className="primary-button" disabled={pending}>
        {pending ? "Creating code…" : "Create credit code"}
      </button>
      {state.message && (
        <p className={state.status === "error" ? "form-error" : "privacy-notice"} role="status">
          {state.message}
        </p>
      )}
      {state.code && (
        <div className="admin-credit-code-issued">
          <div>
            <span>New code</span>
            <code>{state.code}</code>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void navigator.clipboard.writeText(state.code!)}
          >
            Copy code
          </button>
        </div>
      )}
    </form>
  );
}
