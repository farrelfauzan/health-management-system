import type { Metadata } from 'next';

import { LoginBrand } from '#components/server/auth/login-brand';
import { LoginCard } from '#components/server/auth/login-card';
import { LoginVisualPanel } from '#components/server/auth/login-visual-panel';

export const metadata: Metadata = {
  title: 'Sign in | Saling Jaga',
  description: 'Sign in to the Saling Jaga health management portal',
};

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <LoginVisualPanel />
      <div className="flex min-w-0 items-center justify-center bg-white px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <LoginBrand />
          <LoginCard />
          <p className="text-xs text-slate-500">
            Authorized personnel only. Contact your administrator for access.
          </p>
        </div>
      </div>
    </main>
  );
}
