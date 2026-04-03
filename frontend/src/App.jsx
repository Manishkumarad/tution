import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ShellLayout from './components/ShellLayout';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const AddStudentPage = lazy(() => import('./pages/AddStudentPage'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const StudentPassPage = lazy(() => import('./pages/StudentPassPage'));
const ParentPortalPage = lazy(() => import('./pages/ParentPortalPage'));
const CoachingSignupPage = lazy(() => import('./pages/CoachingSignupPage'));
const FeePlansPage = lazy(() => import('./pages/FeePlansPage'));
const RecoveryAuditPage = lazy(() => import('./pages/RecoveryAuditPage'));

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('accessToken');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<p style={{ padding: 16 }}>Loading...</p>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/coaching-signup" element={<CoachingSignupPage />} />
        <Route path="/student-pass" element={<StudentPassPage />} />
        <Route path="/parent" element={<ParentPortalPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ShellLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/new" element={<AddStudentPage />} />
          <Route path="fee-plans" element={<FeePlansPage />} />
          <Route path="recovery-audit" element={<RecoveryAuditPage />} />
          <Route path="scan" element={<ScanPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
