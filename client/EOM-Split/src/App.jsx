import React from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import { Login, Register, Dashboard, Groups, Expenses, Settlements, Profile } from './Pages'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  const { isAuthenticated, logout, user } = useAuth()

  return (
    <div className="app-root">
      <header className="app-header">
        <nav>
          {isAuthenticated ? (
            <>
              <Link to="/dashboard">Dashboard</Link> |{' '}
              <Link to="/groups">Groups</Link> |{' '}
              <Link to="/expenses">Expenses</Link> |{' '}
              <Link to="/settlements">Settlements</Link> |{' '}
              <Link to="/profile">Profile</Link> |{' '}
              <span>{user?.name || 'User'}</span> |{' '}
              <button type="button" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link> |{' '}
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>

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
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <Groups />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settlements"
            element={
              <ProtectedRoute>
                <Settlements />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
