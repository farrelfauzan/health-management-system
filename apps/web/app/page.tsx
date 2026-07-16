import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(120deg,#f0fdf4_0%,#ecfeff_50%,#f8fafc_100%)] px-6 py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-3xl border border-emerald-200 bg-white/85 p-8 shadow-[0_12px_40px_-20px_rgba(16,185,129,0.55)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">HMS MVP</p>
        <h1 className="text-4xl font-semibold text-slate-900">Health Management System</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-700 md:text-base">
          Foundation and RBAC baseline are in place. Continue with Phase 3 module delivery from this
          workspace.
        </p>
        <div>
          <Link
            href="/admin/users"
            className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Open Admin Management
          </Link>
        </div>
      </div>
    </main>
  );
}
