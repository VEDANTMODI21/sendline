import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/http';
import type { EmailStatus, Folder, ScheduleRequest } from '@/types/api';

export const keys = {
  me: ['me'] as const,
  overview: ['overview'] as const,
  senders: ['senders'] as const,
  config: ['config'] as const,
  slack: ['slack'] as const,
  emails: (folder: Folder, q: string, status: EmailStatus[]) => ['emails', folder, q, status.join(',')] as const,
  email: (id: string) => ['email', id] as const,
};

/** Session probe: resolves to null (not an error) when signed out. */
export function useSession() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api.me().catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    staleTime: 60_000,
    retry: false,
  });
}

export const useOverview = () =>
  useQuery({ queryKey: keys.overview, queryFn: api.overview, refetchInterval: 5_000 });

export const useSenders = () => useQuery({ queryKey: keys.senders, queryFn: api.senders, staleTime: 30_000 });
export const useAppConfig = () => useQuery({ queryKey: keys.config, queryFn: api.config, staleTime: Infinity });
export const useSlackStatus = () => useQuery({ queryKey: keys.slack, queryFn: api.slack, staleTime: 30_000 });

/** Mailbox feed with keyset pagination; polls so status changes (scheduled → sent) appear live. */
export function useEmailFeed(folder: Folder, q: string, status: EmailStatus[]) {
  return useInfiniteQuery({
    queryKey: keys.emails(folder, q, status),
    queryFn: ({ pageParam }) => api.emails({ folder, q: q || undefined, status, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  });
}

export const useEmail = (id: string) =>
  useQuery({
    queryKey: keys.email(id),
    queryFn: () => api.email(id),
    // Keep polling while it is still in flight so the view flips to "Sent" by itself.
    refetchInterval: (query) => (['sent', 'failed', 'cancelled'].includes(query.state.data?.status ?? '') ? false : 4_000),
  });

export function useInvalidateMail() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['emails'] }),
      qc.invalidateQueries({ queryKey: keys.overview }),
      qc.invalidateQueries({ queryKey: keys.senders }),
    ]);
}

export function useSchedule() {
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: ({ body, key }: { body: ScheduleRequest; key: string }) => api.schedule(body, key),
    onSuccess: () => invalidate(),
  });
}

export function useCancelEmail() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: (id: string) => api.cancelEmail(id),
    onSuccess: (_d, id) => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: keys.email(id) })]),
  });
}

export function useSlackActions() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: keys.slack }), qc.invalidateQueries({ queryKey: keys.me })]);
  return {
    test: useMutation({ mutationFn: api.slackTest, onError: () => refresh() }),
    disconnect: useMutation({ mutationFn: api.slackDisconnect, onSuccess: () => refresh() }),
  };
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      qc.setQueryData(keys.me, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}
