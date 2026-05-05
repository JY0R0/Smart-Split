import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login, Register, Dashboard, Groups, Expenses, Settlements, Profile, AdminDashboard } from './Pages'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './layouts/AppShell'

export default function App() {
  const { isAuthenticated, logout, user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const authenticatedHome = isAdmin ? '/admin' : '/dashboard'

  return (
    <div className="app-root">
      <main>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={isAuthenticated ? authenticatedHome : '/login'} replace />}
          />
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to={authenticatedHome} replace /> : <Login />}
          />
          <Route
            path="/register"
            element={isAuthenticated ? <Navigate to={authenticatedHome} replace /> : <Register />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard onLogout={logout} user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                {isAdmin ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <AppShell user={user} onLogout={logout}>
                    <Dashboard />
                  </AppShell>
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                {isAdmin ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <AppShell user={user} onLogout={logout}>
                    <Groups />
                  </AppShell>
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                {isAdmin ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <AppShell user={user} onLogout={logout}>
                    <Expenses />
                  </AppShell>
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/settlements"
            element={
              <ProtectedRoute>
                {isAdmin ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <AppShell user={user} onLogout={logout}>
                    <Settlements />
                  </AppShell>
                )}
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                {isAdmin ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <AppShell user={user} onLogout={logout}>
                    <Profile />
                  </AppShell>
                )}
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={isAuthenticated ? authenticatedHome : '/login'} replace />} />
        </Routes>
      </main>
    </div>
  )
}
