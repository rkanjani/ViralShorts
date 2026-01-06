import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  AuthProvider,
  ToastProvider,
  ProjectProvider,
  WebSocketProvider,
} from './context';
import { Layout, AuthLayout } from './components/layout/Layout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectPage } from './pages/ProjectPage';
import { EditorPage } from './pages/EditorPage';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <WebSocketProvider>
            <ProjectProvider>
              <Routes>
                {/* Public routes */}
                <Route element={<AuthLayout />}>
                  <Route path="/" element={<LandingPage />} />
                </Route>

                {/* Protected routes */}
                <Route element={<Layout />}>
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/project/:id"
                    element={
                      <ProtectedRoute>
                        <ProjectPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                {/* Editor route (has its own layout) */}
                <Route
                  path="/editor/:id"
                  element={
                    <ProtectedRoute>
                      <EditorPage />
                    </ProtectedRoute>
                  }
                />

                {/* 404 */}
                <Route
                  path="*"
                  element={
                    <div className="flex min-h-screen items-center justify-center">
                      <div className="text-center">
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                          404
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                          Page not found
                        </p>
                      </div>
                    </div>
                  }
                />
              </Routes>
            </ProjectProvider>
          </WebSocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
