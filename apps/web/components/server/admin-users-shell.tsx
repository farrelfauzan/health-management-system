import type { ReactNode } from 'react';

type AdminUsersShellProps = {
  children: ReactNode;
};

export function AdminUsersShell({ children }: AdminUsersShellProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#d9f99d_0%,#f0fdf4_36%,#ecfeff_100%)] px-4 py-10 text-slate-900 md:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-3xl border border-emerald-200/70 bg-white/85 p-6 shadow-[0_10px_50px_-20px_rgba(22,163,74,0.45)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Admin Management
          </p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">User and Role Operations Panel</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700 md:text-base">
            Server-rendered page shell with isolated client interaction layer. This follows the app
            convention: Next.js app routes/layout remain server components, while interactive logic
            lives under `components/client`.
          </p>
        </section>
        {children}
      </div>
    </main>
  );
}
