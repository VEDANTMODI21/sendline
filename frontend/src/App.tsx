import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { MailboxPage } from '@/features/mailbox/MailboxPage';
import { EmailDetailPage } from '@/features/detail/EmailDetailPage';
import { ComposePage } from '@/features/compose/ComposePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/scheduled" element={<MailboxPage key="scheduled" folder="scheduled" />} />
        <Route path="/sent" element={<MailboxPage key="sent" folder="sent" />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/emails/:id" element={<EmailDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/scheduled" replace />} />
    </Routes>
  );
}
