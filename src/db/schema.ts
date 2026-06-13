import Dexie, { type Table } from 'dexie';
import type {
  BodyRegion,
  Muscle,
  Exercise,
  ExerciseVariation,
  ExerciseMuscleMapping,
  User,
  WorkoutSession,
  SessionExercise,
  WorkoutSet,
  UserInjuryProfile,
  PainLog,
  Routine,
  RoutineExercise,
} from '../types';

export class WorkoutDB extends Dexie {
  // 시드 데이터 테이블
  bodyRegions!: Table<BodyRegion, string>;
  muscles!: Table<Muscle, string>;
  exercises!: Table<Exercise, string>;
  exerciseVariations!: Table<ExerciseVariation, string>;
  exerciseMuscleMappings!: Table<ExerciseMuscleMapping, [string, string]>;

  // 사용자 데이터 테이블 (Slice 1 활용)
  users!: Table<User, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  sessionExercises!: Table<SessionExercise, string>;
  workoutSets!: Table<WorkoutSet, string>;

  // 향후 슬라이스용 (스키마만 정의, Slice 1에서는 비워둠)
  userInjuryProfiles!: Table<UserInjuryProfile, string>;
  painLogs!: Table<PainLog, string>;
  routines!: Table<Routine, string>;
  routineExercises!: Table<RoutineExercise, [string, string]>;

  constructor() {
    super('WorkoutDB');
    this.version(1).stores({
      // 시드
      bodyRegions: 'id, parent_id',
      muscles: 'id, group',
      exercises: 'id, name, category, default_equipment, alternative_group_id',
      exerciseVariations: 'id, exercise_id, is_default',
      exerciseMuscleMappings: '[exercise_id+muscle_id], exercise_id, muscle_id',

      // 사용자 데이터
      users: 'id',
      workoutSessions: 'id, date',
      sessionExercises: 'id, session_id, exercise_id',
      workoutSets: 'id, session_exercise_id, set_number',

      // 향후 슬라이스용
      userInjuryProfiles: 'id, user_id, body_region_id, status',
      painLogs: 'id, user_id, date, body_region_id',
      routines: 'id',
      routineExercises: '[routine_id+exercise_id], routine_id',
    });
  }
}

export const db = new WorkoutDB();

if (import.meta.env.DEV) {
  // 개발용: 브라우저 콘솔에서 __db로 Dexie 인스턴스에 접근 가능
  (globalThis as unknown as { __db: WorkoutDB }).__db = db;
}
