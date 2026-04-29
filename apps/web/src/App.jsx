import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AutoLogout from './components/AutoLogout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import Booking from './pages/Booking';
import EventLog from './pages/EventLog';
import LabSheet from './pages/LabSheet';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AutoLogout>
          <ThemeProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/lab-sheet" element={<LabSheet />} />
              <Route path="/admin" element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              } />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/booking"
              element={
                <ProtectedRoute>
                  <Booking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/event-log"
              element={
                <AdminRoute>
                  <EventLog />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ThemeProvider>
        </AutoLogout>
      </AuthProvider>
    </Router>
  );
}

export default App;
