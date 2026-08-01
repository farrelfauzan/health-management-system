/**
 * The assistant screen, per shell.
 *
 * There is one route per shell rather than one shared route, because
 * `proxy.ts` gates by path prefix: `/admin/:path*` is admin-only, so a doctor
 * sent to the admin assistant screen is bounced to their dashboard before the
 * page renders. Every entry point — launcher, top bar, sidebar, the toast's
 * action — has to agree with the shell it is rendered in, which is why the
 * active path is declared by the layout and read from the assistant context
 * rather than imported directly by each of them.
 */
export const ADMIN_ASSISTANT_PATH = '/admin/ai-assistant';

export const DOCTOR_ASSISTANT_PATH = '/doctor/ai-assistant';
