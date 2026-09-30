import { Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/queries';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorState, FullPageSpinner } from '@/components/ui';

/** Gate for every signed-in route: spinner → shell, or bounce to /login. */
export function RequireAuth() {
  const session = useSession();
  if (session.isPending) return <FullPageSpinner label="Checking your session…" />;
  if (session.isError) return <ErrorState message={session.error.message} onRetry={() => session.refetch()} />;
  if (!session.data) return <Navigate to="/login" replace />;
  return <AppShell user={session.data} />;
}
