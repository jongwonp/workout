import { Link, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';

interface Tab {
  to: string;
  label: string;
  /** 활성화 판정에 쓰일 경로 prefix들 */
  matchPrefixes: string[];
  /** 진행 중 세션 인디케이터를 표시할 탭인지 */
  showSessionDot?: boolean;
}

const TABS: Tab[] = [
  { to: '/exercises', label: '종목', matchPrefixes: ['/exercises'] },
  { to: '/session/new', label: '세션', matchPrefixes: ['/session'], showSessionDot: true },
  { to: '/routines', label: '루틴', matchPrefixes: ['/routines'] },
  { to: '/history', label: '히스토리', matchPrefixes: ['/history'] },
  { to: '/settings', label: '설정', matchPrefixes: ['/settings'] },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);

  return (
    <nav
      className="border-t border-gray-200 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const active = tab.matchPrefixes.some((p) => pathname.startsWith(p));
          // 진행 중 세션이 있고 해당 탭이면 세션 id로 직접 이동
          const to =
            tab.showSessionDot && currentSessionId
              ? `/session/${currentSessionId}`
              : tab.to;
          const showDot = tab.showSessionDot && currentSessionId !== null;

          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={to}
                className={[
                  'relative flex h-14 items-center justify-center text-sm font-medium',
                  active ? 'text-black' : 'text-gray-400',
                ].join(' ')}
              >
                {tab.label}
                {showDot && (
                  <span
                    aria-label="진행 중 세션 있음"
                    className="absolute right-[35%] top-3 h-2 w-2 rounded-full bg-red-500"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
