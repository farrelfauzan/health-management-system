import { LoginForm } from '#components/client/auth/login-form';

export function LoginCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-500">Use your staff account to access the portal.</p>
      </div>
      <LoginForm />
    </section>
  );
}
