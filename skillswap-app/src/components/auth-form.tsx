"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type AuthFormProps = { mode: "sign-in" | "sign-up" | "forgot" | "reset"; resetToken?: string };

export function AuthForm({ mode, resetToken }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    try {
      if (mode === "sign-up") {
        const name = String(form.get("name") ?? "").trim();
        const suppliedCode = new URLSearchParams(window.location.search).get("ref") ?? "";
        const referralCode = /^[a-f0-9]{12}$/i.test(suppliedCode) ? suppliedCode.toUpperCase() : "";
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: referralCode
            ? `/onboarding?ref=${encodeURIComponent(referralCode)}`
            : "/onboarding",
        });
        if (result.error)
          throw new Error(result.error.message || "We could not create your account.");
        setMessage(
          "Check your inbox and spam folder for the verification link. If it does not arrive, try signing in with this email to request another link.",
        );
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/onboarding",
        });
        if (result.error) throw new Error(result.error.message || "We could not sign you in.");
        router.replace("/onboarding");
        router.refresh();
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        if (result.error)
          throw new Error(result.error.message || "We could not send the recovery email.");
        setMessage("If an account exists for that email, a password reset link is on its way.");
      } else {
        const result = await authClient.resetPassword({
          newPassword: password,
          token: resetToken ?? "",
        });
        if (result.error)
          throw new Error(result.error.message || "That reset link is invalid or expired.");
        setMessage("Your password has been updated. You can now sign in.");
      }
    } catch (cause) {
      const reason =
        cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
      setError(
        reason.includes("Verification email could not be delivered")
          ? "Your account may have been created, but the verification email could not be sent. Once email delivery is fixed, sign in with this email and password to request another link."
          : reason,
      );
    } finally {
      setPending(false);
    }
  }

  const isReset = mode === "reset";
  const title =
    mode === "sign-up"
      ? "Create your account"
      : mode === "sign-in"
        ? "Welcome back"
        : mode === "forgot"
          ? "Reset your password"
          : "Choose a new password";

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <Link className="auth-back" href="/">
        ← Back to SkillSwap
      </Link>
      <p className="section-kicker">YOUR SKILLS HAVE VALUE</p>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-intro">
        {mode === "sign-up"
          ? "One Member account lets you teach, learn, or do both."
          : mode === "sign-in"
            ? "Sign in to pick up where your learning journey left off."
            : "We’ll help you get back into your SkillSwap account."}
      </p>
      <form className="auth-fields" onSubmit={submit}>
        {mode === "sign-up" && (
          <label>
            Full name
            <input autoComplete="name" name="name" required minLength={2} maxLength={80} />
          </label>
        )}
        {(mode === "sign-up" || mode === "sign-in" || mode === "forgot") && (
          <label>
            Email address
            <input autoComplete="email" name="email" type="email" required />
          </label>
        )}
        {(mode === "sign-up" || mode === "sign-in" || isReset) && (
          <label>
            {isReset ? "New password" : "Password"}
            <span className="auth-password-input">
              <input
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                maxLength={128}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="password-visibility-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
        )}
        {mode === "sign-up" && (
          <p className="field-hint">
            Use at least 8 characters. You can teach and learn from this same account.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        <button
          className="button button-primary auth-submit"
          disabled={pending || (isReset && !resetToken)}
          type="submit"
        >
          {pending
            ? "Please wait…"
            : mode === "sign-up"
              ? "Create Member account"
              : mode === "sign-in"
                ? "Sign in"
                : mode === "forgot"
                  ? "Send reset link"
                  : "Update password"}
        </button>
      </form>
      {mode === "sign-in" && (
        <p className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <span>
            New to SkillSwap? <Link href="/sign-up">Create an account</Link>
          </span>
        </p>
      )}
      {mode === "sign-up" && (
        <p className="auth-links">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      )}
      {(mode === "forgot" || isReset) && (
        <p className="auth-links">
          <Link href="/sign-in">Return to sign in</Link>
        </p>
      )}
    </section>
  );
}
