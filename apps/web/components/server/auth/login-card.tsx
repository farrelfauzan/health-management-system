import { LoginForm } from '#components/client/auth/login-form';

export function LoginCard() {
  return (
    // No card chrome: the split layout already frames the form, and a bordered
    // white box on a white column only adds a seam.
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          Sign in
        </h1>
        <p className="text-sm text-slate-500">Use your staff account to access the portal.</p>
      </div>
      <LoginForm />
    </section>
  );
}
