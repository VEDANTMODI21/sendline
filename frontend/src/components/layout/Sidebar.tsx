import { NavLink, useNavigate } from 'react-router-dom';
import { Clock, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import type { User } from '@/types/api';
import { Button } from '@/components/ui';
import { useOverview } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';

function NavItem({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
          isActive ? 'bg-brand-50 font-semibold text-ink' : 'text-ink-soft hover:bg-canvas',
        )
      }
    >
      <span className="text-ink-soft">{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-[11px] font-normal text-muted tabular-nums">{count.toLocaleString()}</span>}
    </NavLink>
  );
}

export function Sidebar({ user }: { user: User }) {
  const navigate = useNavigate();
  const overview = useOverview();
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-line px-3 py-4">
      <div className="px-1.5 pt-1">
        <Logo />
      </div>
      <UserMenu user={user} />
      <Button variant="outline" pill className="w-full" onClick={() => navigate('/compose')}>
        Compose
      </Button>
      <nav aria-label="Mailboxes" className="flex flex-col gap-0.5">
        <p className="px-2.5 pb-1 text-[10px] font-medium tracking-wider text-muted uppercase">Core</p>
        <NavItem to="/scheduled" icon={<Clock className="size-4" />} label="Scheduled" count={overview.data?.scheduled} />
        <NavItem to="/sent" icon={<Send className="size-4" />} label="Sent" count={overview.data?.sent} />
      </nav>
      <div className="mt-auto px-2.5 text-[11px] leading-relaxed text-muted">
        {overview.data && (
          <>
            <span className={cn('mr-1.5 inline-block size-1.5 rounded-full', overview.data.searchHealthy ? 'bg-brand-500' : 'bg-amber-500')} />
            Search: {overview.data.searchHealthy ? 'Elasticsearch' : 'fallback (Postgres)'}
          </>
        )}
      </div>
    </aside>
  );
}
