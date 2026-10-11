import { AuthForm } from "@/components/auth-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth-page">
      <AuthForm mode="reset" resetToken={token} />
    </main>
  );
}
