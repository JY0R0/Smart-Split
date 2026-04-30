import React from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import { Login, Register, Dashboard, Groups, Expenses, Settlements, Profile } from './Pages'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './layouts/AppShell'

export default function App() {
  const { isAuthenticated, logout, user } = useAuth()

  return (
    <div className="app-root">
      <main>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
          />
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
          />
          <Route
            path="/register"
            element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />}
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppShell user={user} onLogout={logout}>
                  <Dashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <AppShell user={user} onLogout={logout}>
                  <Groups />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <AppShell user={user} onLogout={logout}>
                  <Expenses />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settlements"
            element={
              <ProtectedRoute>
                <AppShell user={user} onLogout={logout}>
                  <Settlements />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppShell user={user} onLogout={logout}>
                  <Profile />
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
