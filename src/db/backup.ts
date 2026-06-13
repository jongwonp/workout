import { type Table } from 'dexie';
import { db } from './schema';
import { formatDateForFile, nowIso } from '../utils/date';
import type {
  Routine,
  RoutineExercise,
  SessionExercise,
  User,
  WorkoutSession,
  WorkoutSet,
} from '../types';

/**
 * JSON 백업/복원 (slice2-spec §6.1).
 *
 * 백업 데이터: 사용자 테이블만. 시드(BodyRegion / Muscle / Exercise / ...)는 제외 — 앱이 자동 로드.
 *
 * 복원 모드:
 *   - overwrite: 사용자 테이블 clear 후 import
 *   - merge: id 충돌은 skip, 신규만 add
 *
 * 트랜잭션으로 묶어 실패 시 자동 롤백.
 */

export const BACKUP_FORMAT_VERSION = '1.0' as const;

export interface BackupPayload {
  format_version: typeof BACKUP_FORMAT_VERSION;
  exported_at: string;
  app_version: string;
  data: {
    users: User[];
    workoutSessions: WorkoutSession[];
    sessionExercises: SessionExercise[];
    workoutSets: WorkoutSet[];
    routines: Routine[];
    routineExercises: RoutineExercise[];
  };
}

export type ImportMode = 'overwrite' | 'merge';

export interface ImportTableResult {
  inserted: number;
  skipped: number;
}

export interface ImportResult {
  mode: ImportMode;
  total: ImportTableResult;
  tables: Record<keyof BackupPayload['data'], ImportTableResult>;
}

// =========================================
// 백업 (Export)
// =========================================

export async function exportBackup(): Promise<BackupPayload> {
  const [
    users,
    workoutSessions,
    sessionExercises,
    workoutSets,
    routines,
    routineExercises,
  ] = await Promise.all([
    db.users.toArray(),
    db.workoutSessions.toArray(),
    db.sessionExercises.toArray(),
    db.workoutSets.toArray(),
    db.routines.toArray(),
    db.routineExercises.toArray(),
  ]);
  return {
    format_version: BACKUP_FORMAT_VERSION,
    exported_at: nowIso(),
    app_version: __APP_VERSION__,
    data: {
      users,
      workoutSessions,
      sessionExercises,
      workoutSets,
      routines,
      routineExercises,
    },
  };
}

export function downloadBackup(payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-backup-${formatDateForFile(new Date(payload.exported_at))}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================================
// 복원 (Import) — 검증
// =========================================

const TABLE_KEYS: ReadonlyArray<keyof BackupPayload['data']> = [
  'users',
  'workoutSessions',
  'sessionExercises',
  'workoutSets',
  'routines',
  'routineExercises',
];

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

/**
 * 알려진 명백한 깨짐만 거부. 정상 export 결과를 import한다는 happy path가 기본 가정.
 */
export function validateBackup(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new BackupValidationError('백업 파일이 객체 형식이 아닙니다.');
  }
  const p = payload as Record<string, unknown>;

  if (p.format_version !== BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(
      `호환되지 않는 백업 버전입니다. (file: ${String(p.format_version)}, expected: ${BACKUP_FORMAT_VERSION})`
    );
  }

  if (!p.data || typeof p.data !== 'object') {
    throw new BackupValidationError('data 필드가 비어 있습니다.');
  }
  const data = p.data as Record<string, unknown>;

  for (const key of TABLE_KEYS) {
    if (!Array.isArray(data[key])) {
      throw new BackupValidationError(`${key} 테이블이 배열이 아닙니다.`);
    }
  }

  // PK 필드 존재 — 단순 PK 테이블
  const singlePkTables = [
    'users',
    'workoutSessions',
    'sessionExercises',
    'workoutSets',
    'routines',
  ] as const;
  for (const key of singlePkTables) {
    const rows = data[key] as Array<Record<string, unknown>>;
    for (let i = 0; i < rows.length; i++) {
      if (typeof rows[i].id !== 'string') {
        throw new BackupValidationError(`${key}[${i}].id가 문자열이 아닙니다.`);
      }
    }
  }
  const reRows = data.routineExercises as Array<Record<string, unknown>>;
  for (let i = 0; i < reRows.length; i++) {
    if (
      typeof reRows[i].routine_id !== 'string' ||
      typeof reRows[i].exercise_id !== 'string'
    ) {
      throw new BackupValidationError(
        `routineExercises[${i}]의 routine_id/exercise_id가 누락됐습니다.`
      );
    }
  }

  // 참조 무결성 (백업 데이터 내부에서만)
  const sessionIds = new Set(
    (data.workoutSessions as Array<{ id: string }>).map((r) => r.id)
  );
  const sessExIds = new Set(
    (data.sessionExercises as Array<{ id: string }>).map((r) => r.id)
  );
  const routineIds = new Set(
    (data.routines as Array<{ id: string }>).map((r) => r.id)
  );

  for (const se of data.sessionExercises as Array<{ session_id: string }>) {
    if (!sessionIds.has(se.session_id)) {
      throw new BackupValidationError(
        `sessionExercise.session_id="${se.session_id}"가 workoutSessions에 없습니다.`
      );
    }
  }
  for (const ws of data.workoutSets as Array<{ session_exercise_id: string }>) {
    if (!sessExIds.has(ws.session_exercise_id)) {
      throw new BackupValidationError(
        `workoutSet.session_exercise_id="${ws.session_exercise_id}"가 sessionExercises에 없습니다.`
      );
    }
  }
  for (const re of data.routineExercises as Array<{ routine_id: string }>) {
    if (!routineIds.has(re.routine_id)) {
      throw new BackupValidationError(
        `routineExercise.routine_id="${re.routine_id}"가 routines에 없습니다.`
      );
    }
  }

  return payload as BackupPayload;
}

// =========================================
// 복원 (Import) — 실행
// =========================================

/** 단순 PK 테이블에 대해 mode에 맞춰 insert. */
async function importSinglePkTable<T extends { id: string }>(
  table: Table<T, string>,
  rows: T[],
  mode: ImportMode
): Promise<ImportTableResult> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  if (mode === 'overwrite') {
    await table.bulkAdd(rows);
    return { inserted: rows.length, skipped: 0 };
  }
  const ids = rows.map((r) => r.id);
  const existing = await table.bulkGet(ids);
  const toAdd: T[] = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    if (existing[i]) skipped++;
    else toAdd.push(rows[i]);
  }
  if (toAdd.length > 0) await table.bulkAdd(toAdd);
  return { inserted: toAdd.length, skipped };
}

async function importRoutineExercises(
  rows: RoutineExercise[],
  mode: ImportMode
): Promise<ImportTableResult> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  if (mode === 'overwrite') {
    await db.routineExercises.bulkAdd(rows);
    return { inserted: rows.length, skipped: 0 };
  }
  const keys = rows.map(
    (r) => [r.routine_id, r.exercise_id] as [string, string]
  );
  const existing = await db.routineExercises.bulkGet(keys);
  const toAdd: RoutineExercise[] = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    if (existing[i]) skipped++;
    else toAdd.push(rows[i]);
  }
  if (toAdd.length > 0) await db.routineExercises.bulkAdd(toAdd);
  return { inserted: toAdd.length, skipped };
}

export async function importBackup(
  rawPayload: unknown,
  mode: ImportMode
): Promise<ImportResult> {
  const payload = validateBackup(rawPayload);

  let tablesResult!: ImportResult['tables'];

  await db.transaction(
    'rw',
    [
      db.users,
      db.workoutSessions,
      db.sessionExercises,
      db.workoutSets,
      db.routines,
      db.routineExercises,
    ],
    async () => {
      if (mode === 'overwrite') {
        await Promise.all([
          db.users.clear(),
          db.workoutSessions.clear(),
          db.sessionExercises.clear(),
          db.workoutSets.clear(),
          db.routines.clear(),
          db.routineExercises.clear(),
        ]);
      }

      const [users, workoutSessions, sessionExercises, workoutSets, routines, routineExercises] =
        await Promise.all([
          importSinglePkTable(db.users, payload.data.users, mode),
          importSinglePkTable(db.workoutSessions, payload.data.workoutSessions, mode),
          importSinglePkTable(db.sessionExercises, payload.data.sessionExercises, mode),
          importSinglePkTable(db.workoutSets, payload.data.workoutSets, mode),
          importSinglePkTable(db.routines, payload.data.routines, mode),
          importRoutineExercises(payload.data.routineExercises, mode),
        ]);

      tablesResult = {
        users,
        workoutSessions,
        sessionExercises,
        workoutSets,
        routines,
        routineExercises,
      };
    }
  );

  const total: ImportTableResult = { inserted: 0, skipped: 0 };
  for (const t of Object.values(tablesResult)) {
    total.inserted += t.inserted;
    total.skipped += t.skipped;
  }
  return { mode, total, tables: tablesResult };
}
