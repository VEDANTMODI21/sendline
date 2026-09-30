import { useState } from 'react';
import { ChevronDown, ExternalLink, Hash, LayoutDashboard, LogOut, Send, Unplug } from 'lucide-react';
import type { User } from '@/types/api';
import { Avatar, MenuItem, Popover, useToast } from '@/components/ui';
import { links } from '@/lib/api';
import { useLogout, useSlackActions, useSlackStatus } from '@/hooks/queries';
import { ApiError } from '@/lib/http';

export function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const logout = useLogout();
  const slack = useSlackStatus();
  const { test, disconnect } = useSlackActions();
  const connection = slack.data?.connection ?? user.slack;

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: () => toast.success('Test message sent', `Check ${connection?.channelName ?? 'your channel'} in Slack.`),
      onError: (e) => toast.error('Slack test failed', e instanceof ApiError ? e.message : undefined),
    });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg bg-canvas px-2.5 py-2 text-left transition-colors hover:bg-line/60"
      >
        <Avatar src={user.avatarUrl} name={user.name || user.email} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{user.name || 'Signed in'}</span>
          <span className="block truncate text-[11px] text-muted">{user.email}</span>
        </span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-72 p-1.5">
        <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Slack alerts</div>
        {connection ? (
          <>
            <div className="mx-2.5 mb-1 flex items-center gap-2 rounded-md bg-brand-50 px-2.5 py-2 text-xs text-brand-700">
              <span className="size-1.5 rounded-full bg-brand-500" />
              Connected to <b className="font-semibold">{connection.channelName}</b> · {connection.teamName}
            </div>
            <MenuItem icon={<Send className="size-4 text-muted" />} onClick={sendTest}>
              {test.isPending ? 'Sending test…' : 'Send test message'}
            </MenuItem>
            <MenuItem
              icon={<Unplug className="size-4 text-muted" />}
              onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.info('Slack disconnected', 'Rate-limit alerts are off.') })}
            >
              Disconnect Slack
            </MenuItem>
          </>
        ) : (
          <>
            <p className="px-2.5 pb-1 text-xs text-muted">Get a Slack message the moment a sender hits its hourly limit.</p>
            {slack.data?.available === false ? (
              <p className="mx-2.5 mb-1 rounded-md bg-amber-tint px-2.5 py-2 text-xs text-amber-ink">Slack app credentials are not configured on the server.</p>
            ) : (
              <MenuItem href={links.slackInstall} icon={<Hash className="size-4 text-brand-600" />}>
                Connect Slack
              </MenuItem>
            )}
          </>
        )}
        <div className="my-1.5 border-t border-line" />
        <MenuItem href={links.queueBoard} external icon={<LayoutDashboard className="size-4 text-muted" />}>
          <span className="flex-1">Queue monitor</span>
          <ExternalLink className="size-3 text-muted" />
        </MenuItem>
        <MenuItem tone="danger" icon={<LogOut className="size-4" />} onClick={() => logout.mutate()}>
          Log out
        </MenuItem>
      </Popover>
    </div>
  );
}
