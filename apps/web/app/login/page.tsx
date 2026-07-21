import type { Metadata } from 'next';

import { LoginBrand } from '#components/server/auth/login-brand';
import { LoginCard } from '#components/server/auth/login-card';

export const metadata: Metadata = {
  title: 'Sign in | Saling Jaga',
  description: 'Sign in to the Saling Jaga health management portal',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <LoginBrand />
        <LoginCard />
        <p className="text-center text-xs text-slate-500">
          Authorized personnel only. Contact your administrator for access.
        </p>
      </div>
    </main>
  );
}
