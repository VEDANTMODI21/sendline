import { Outlet, useLocation } from 'react-router-dom';
import type { User } from '@/types/api';
import { Sidebar } from './Sidebar';

// Mailbox views get the sidebar; compose and the reading view are full-width, as in the design.
const FOCUS_ROUTES = [/^\/compose/, /^\/emails\//];

export function AppShell({ user }: { user: User }) {
  const { pathname } = useLocation();
  const focus = FOCUS_ROUTES.some((r) => r.test(pathname));
  return (
    <div className="flex h-full">
      {!focus && <Sidebar user={user} />}
      <main className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
