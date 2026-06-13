import { useEffect, useRef, useState } from 'react';
import {
  downloadBackup,
  exportBackup,
  importBackup,
  type ImportMode,
  type ImportResult,
} from '../db/backup';
import { useStorageStore } from '../store/storageStore';
import { useUserStore } from '../store/userStore';
import type { WeightUnit } from '../utils/unit';

/**
 * 설정 화면 — Slice 2의 작업 순서대로 섹션을 채워간다.
 * 현재 구현: 영구 저장 권한 상태 + 재요청 (F1.14).
 * 채울 예정: 프로필(체중/단위), 입력 환경(RPE/RIR 선호), 데이터 관리(백업/복원), 정보.
 */

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="border-b border-gray-100 bg-white px-4 py-4">
      <h2 className="mb-3 text-xs font-semibold text-gray-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const isPersistent = useStorageStore((s) => s.isPersistent);
  const supported = useStorageStore((s) => s.supported);
  const estimate = useStorageStore((s) => s.estimate);
  const requestPersistence = useStorageStore((s) => s.requestPersistence);
  const refreshEstimate = useStorageStore((s) => s.refreshEstimate);

  // 프로필 상태
  const user = useUserStore((s) => s.user);
  const setBodyWeight = useUserStore((s) => s.setBodyWeight);
  const setUnit = useUserStore((s) => s.setUnit);
  const setIntensityMetric = useUserStore((s) => s.setIntensityMetric);
  const [weightInput, setWeightInput] = useState(
    user ? String(user.body_weight_kg) : ''
  );
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) setWeightInput(String(user.body_weight_kg));
  }, [user]);

  const handleWeightBlur = async () => {
    if (!user) return;
    const num = Number(weightInput);
    if (Number.isNaN(num) || num <= 0) {
      setProfileMsg('체중은 0보다 큰 숫자여야 해요');
      setWeightInput(String(user.body_weight_kg));
      return;
    }
    if (Math.abs(num - user.body_weight_kg) < 0.01) return; // no-op
    try {
      await setBodyWeight(num);
      setProfileMsg('체중이 저장됐어요');
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (err) {
      setProfileMsg(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUnitChange = async (next: WeightUnit) => {
    if (!user || user.unit_preference === next) return;
    try {
      await setUnit(next);
      setProfileMsg(`표시 단위를 ${next}로 변경했어요`);
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (err) {
      setProfileMsg(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleIntensityChange = async (next: 'rpe' | 'rir') => {
    if (!user || user.intensity_metric === next) return;
    try {
      await setIntensityMetric(next);
      setProfileMsg(`강도 표기를 ${next.toUpperCase()}로 변경했어요`);
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (err) {
      setProfileMsg(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 데이터 관리 상태
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [dataMsg, setDataMsg] = useState<
    { type: 'success' | 'error'; text: string } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    refreshEstimate();
  }, [refreshEstimate]);

  const handleExport = async () => {
    setBusy('export');
    setDataMsg(null);
    try {
      const payload = await exportBackup();
      downloadBackup(payload);
      const counts = payload.data;
      setDataMsg({
        type: 'success',
        text: `백업 다운로드 완료. 세션 ${counts.workoutSessions.length} / 세트 ${counts.workoutSets.length} / 루틴 ${counts.routines.length}`,
      });
      refreshEstimate();
    } catch (err) {
      console.error('백업 실패', err);
      setDataMsg({
        type: 'error',
        text: `백업 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    // 같은 파일 재선택 가능하게 reset
    e.target.value = '';
    if (!file) return;

    const modeLabel = importMode === 'overwrite' ? '덮어쓰기' : '병합';
    const warning =
      importMode === 'overwrite'
        ? '⚠️ 덮어쓰기는 현재 사용자 데이터를 모두 삭제한 후 백업으로 교체해요. 되돌릴 수 없습니다.\n\n계속하려면 먼저 현재 데이터를 백업하세요.\n\n정말 진행할까요?'
        : `백업 파일을 "${modeLabel}" 모드로 복원할까요?\n\n현재 DB에 없는 레코드만 추가됩니다. id 충돌은 건너뜁니다.`;
    if (!window.confirm(warning)) return;

    setBusy('import');
    setDataMsg(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('JSON 파싱 실패 — 올바른 백업 파일이 아닙니다.');
      }
      const result: ImportResult = await importBackup(parsed, importMode);
      setDataMsg({
        type: 'success',
        text: `복원 완료 (${modeLabel}). 추가 ${result.total.inserted}건 / 건너뜀 ${result.total.skipped}건`,
      });
      refreshEstimate();
    } catch (err) {
      console.error('복원 실패', err);
      setDataMsg({
        type: 'error',
        text: `복원 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <Section title="프로필">
        {profileMsg && (
          <p className="rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-700">
            {profileMsg}
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500">
            체중 (kg)
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            onBlur={handleWeightBlur}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-gray-400"
          />
          <p className="mt-1 text-xs text-gray-400">
            맨몸 운동의 부하 계산에 사용돼요. 표시 단위와 무관하게 kg으로 저장됩니다.
          </p>
        </div>
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-gray-500">표시 단위</p>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="unitPreference"
                value="kg"
                checked={user?.unit_preference === 'kg'}
                onChange={() => handleUnitChange('kg')}
              />
              kg
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="unitPreference"
                value="lb"
                checked={user?.unit_preference === 'lb'}
                onChange={() => handleUnitChange('lb')}
              />
              lb
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            데이터는 항상 kg로 저장되며, 표시할 때만 변환됩니다.
          </p>
        </div>
      </Section>

      <Section title="입력 환경">
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">
            세트 강도 표기
          </p>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="intensityMetric"
                value="rpe"
                checked={user?.intensity_metric === 'rpe'}
                onChange={() => handleIntensityChange('rpe')}
              />
              RPE (1~10, 높을수록 힘듦)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="intensityMetric"
                value="rir"
                checked={user?.intensity_metric === 'rir'}
                onChange={() => handleIntensityChange('rir')}
              />
              RIR (0~5, 남은 반복 수)
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            RPE = 10 − RIR. 한 번에 한 가지만 표시됩니다. 데이터는 저장된 형식 그대로 유지돼요.
          </p>
        </div>
      </Section>

      <Section title="데이터 관리">
        {dataMsg && (
          <div
            className={
              dataMsg.type === 'success'
                ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800'
                : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700'
            }
          >
            {dataMsg.text}
          </div>
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={busy !== null}
          className="h-11 w-full rounded-lg border border-gray-300 text-sm font-medium text-black active:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'export' ? '백업 중...' : '전체 데이터 백업 (JSON 다운로드)'}
        </button>

        <div className="mt-3">
          <p className="mb-2 text-xs text-gray-500">복원 모드</p>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="importMode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
                disabled={busy !== null}
              />
              병합 (중복 건너뜀)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="importMode"
                value="overwrite"
                checked={importMode === 'overwrite'}
                onChange={() => setImportMode('overwrite')}
                disabled={busy !== null}
              />
              덮어쓰기
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRestoreClick}
          disabled={busy !== null}
          className="h-11 w-full rounded-lg border border-gray-300 text-sm font-medium text-black active:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'import' ? '복원 중...' : '백업 파일에서 복원'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleFileSelected}
        />
        {importMode === 'overwrite' && (
          <p className="text-xs text-amber-700">
            ⚠️ 덮어쓰기는 되돌릴 수 없습니다. 먼저 백업을 받아두세요.
          </p>
        )}
      </Section>

      <Section title="저장공간">
        {!supported && (
          <p className="text-xs text-gray-500">
            이 브라우저는 Storage API를 지원하지 않아요.
          </p>
        )}
        {supported && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-black">영구 저장 권한</span>
              {isPersistent === null ? (
                <span className="text-xs text-gray-400">확인 중...</span>
              ) : isPersistent ? (
                <span className="text-xs font-medium text-green-700">✅ 활성</span>
              ) : (
                <span className="text-xs font-medium text-amber-700">⚠️ 비활성</span>
              )}
            </div>
            {isPersistent === false && (
              <>
                <p className="text-xs text-gray-500">
                  영구 저장 권한이 없으면 브라우저가 저장공간 부족 시 데이터를 삭제할 수 있어요. 정기 백업을 권장합니다.
                </p>
                <button
                  type="button"
                  onClick={requestPersistence}
                  className="h-9 rounded-md border border-gray-300 px-3 text-xs font-medium text-black active:bg-gray-50"
                >
                  영구 저장 권한 다시 요청
                </button>
              </>
            )}
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-sm text-black">사용량</span>
              {estimate ? (
                <span className="text-xs text-gray-700">
                  {formatBytes(estimate.usage)} / {formatBytes(estimate.quota)}
                  {' '}
                  <span className="text-gray-400">
                    ({(estimate.percentUsed * 100).toFixed(2)}%)
                  </span>
                </span>
              ) : (
                <span className="text-xs text-gray-400">확인 불가</span>
              )}
            </div>
            <button
              type="button"
              onClick={refreshEstimate}
              className="h-9 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700 active:bg-gray-50"
            >
              새로고침
            </button>
          </>
        )}
      </Section>

      <Section title="정보">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-gray-500">앱 버전</span>
          <span className="text-gray-700">{__APP_VERSION__}</span>
        </div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-gray-500">데이터베이스 버전</span>
          <span className="text-gray-700">1</span>
        </div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-gray-500">사용자 ID</span>
          <span className="text-gray-700">me</span>
        </div>
      </Section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
