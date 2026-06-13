import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { ensureSeeded, ensureUser } from './db/seed-loader';
import ExerciseListPage from './pages/ExerciseListPage';
import HistoryDetailPage from './pages/HistoryDetailPage';
import HistoryPage from './pages/HistoryPage';
import RoutineEditPage from './pages/RoutineEditPage';
import RoutineListPage from './pages/RoutineListPage';
import SessionStartPage from './pages/SessionStartPage';
import SettingsPage from './pages/SettingsPage';
import WorkoutSessionPage from './pages/WorkoutSessionPage';
import { useSessionStore } from './store/sessionStore';
import { useStorageStore } from './store/storageStore';
import { useUserStore } from './store/userStore';

function MainLayout() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializeSession = useSessionStore((s) => s.initialize);
  const initializeStorage = useStorageStore((s) => s.initialize);
  const initializeUser = useUserStore((s) => s.initialize);

  useEffect(() => {
    (async () => {
      try {
        await ensureSeeded();
        await ensureUser();
        await Promise.all([initializeSession(), initializeUser()]);
        // F1.14: 영구 저장 권한 요청 (1회). 결과는 storeStore에 기록 — 실패해도 앱 진입은 막지 않음.
        initializeStorage().catch((err) =>
          console.warn('storage init 실패', err)
        );
        setReady(true);
      } catch (err) {
        console.error('초기화 실패', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [initializeSession, initializeStorage, initializeUser]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          초기화 실패: {error}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        로딩 중...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/exercises" replace />} />
          <Route path="/exercises" element={<ExerciseListPage />} />
          <Route path="/session/new" element={<SessionStartPage />} />
          <Route path="/session/:sessionId" element={<WorkoutSessionPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:sessionId" element={<HistoryDetailPage />} />
          <Route
            path="/history/:sessionId/edit"
            element={<WorkoutSessionPage />}
          />
          <Route path="/routines" element={<RoutineListPage />} />
          <Route path="/routines/new" element={<RoutineEditPage />} />
          <Route path="/routines/:routineId/edit" element={<RoutineEditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/exercises" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
