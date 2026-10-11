import { AuthForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <AuthForm mode="forgot" />
    </main>
  );
}
