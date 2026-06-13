/**
 * 본인 부상 프로필 데이터 v1.0
 *
 * spec v4.4의 UserInjuryProfile 모델에 맞춰 작성.
 *
 * 본인 케이스:
 *   - 전면 어깨 부상 (벤치프레스에서 발생, recovering 상태)
 *   - 손목 건초염 (recovering 상태)
 *   - 주의 수준: low (가볍게 인지만 함, 적당히 조절하며 운동)
 *
 * 사용법 (Dexie 예시):
 *   import { myInjuryProfiles } from './my-injury-profiles';
 *   await db.userInjuryProfiles.bulkAdd(myInjuryProfiles);
 */

// =========================================
// 타입 정의 (spec v4.4와 일치)
// =========================================

export type InjuryStatus = 'active' | 'recovering' | 'managed' | 'resolved';
export type CautionLevel = 'high' | 'medium' | 'low';

export interface UserInjuryProfile {
  id: string;
  user_id: string;
  body_region_id: string;
  injury_description: string;
  status: InjuryStatus;
  caution_level: CautionLevel;

  /**
   * 영향 받는 동작 패턴 (Exercise.movement_patterns와 매칭).
   * 안전 필터가 이 패턴을 가진 종목 추천 시 보수적으로 처리.
   */
  affected_patterns: string[];

  /**
   * 영향 받는 그립 (ExerciseVariation.grip_type과 매칭).
   * 해당 그립을 사용하는 변형이면 더 안전한 변형을 우선 추천.
   */
  affected_grips: string[];

  /**
   * 증량 보정 계수. 기본 증량 단위에 곱해서 안전 상한선 계산.
   * 0.5 = 평소 증량의 50%만 허용.
   */
  conservative_increment_factor: number;

  /**
   * 볼륨 한계 보정 계수. effective_limit에 곱해서 적용.
   * 0.85 = 평소 한계의 85%로 더 보수적으로.
   */
  volume_cap_factor: number;

  auto_status_update_enabled: boolean;
  last_pain_log_at: string | null;
  last_status_change_at: string | null;
  started_at: string;
  resolved_at: string | null;
  notes: string | null;
}

// =========================================
// 본인 부상 프로필
// =========================================

export const myInjuryProfiles: UserInjuryProfile[] = [
  // ===== 전면 어깨 부상 =====
  {
    id: 'injury_shoulder_front_001',
    user_id: 'me', // 단일 사용자 앱이므로 고정값

    // 부위: 전면 어깨 (시드 데이터의 BodyRegion.id)
    body_region_id: 'shoulder_front',

    // 부상 내용 — 자유 텍스트, 본인이 나중에 수정 가능
    injury_description: '벤치프레스 중 발생한 전면 어깨 부상',

    // 회복 중 + 가벼운 주의
    status: 'recovering',
    caution_level: 'low',

    // 영향 받는 동작:
    // - horizontal_press: 벤치프레스 계열 (가장 직접적)
    // - incline_press: 인클라인 벤치 (전면 어깨 부담 큼)
    // - vertical_press: OHP 계열 (어깨 위쪽 자극)
    // 안전 필터가 이 패턴의 종목 추천 시 보수적으로 처리됨
    affected_patterns: ['horizontal_press', 'incline_press', 'vertical_press'],

    // 어깨 부상은 동작 패턴 자체가 더 중요해서 그립은 비워둠
    // (필요하면 'pronated' 추가 가능 — 프로네이트 그립이 어깨 앞쪽 부담이 약간 더 큼)
    affected_grips: [],

    // low 주의이지만 recovering 상태라 약간 보수적: 평소 증량의 70%
    conservative_increment_factor: 0.7,

    // 어깨 볼륨은 평소 한계의 90%로 제한
    volume_cap_factor: 0.9,

    // 자동 상태 업데이트 (active → recovering → managed → resolved) 활성화
    // 무통증 체크인이 충분히 쌓이면 시스템이 다운그레이드 제안
    auto_status_update_enabled: true,

    last_pain_log_at: null,
    last_status_change_at: null,

    // 부상 발생 시점은 추정값 — 본인이 정확한 날짜로 수정 권장
    started_at: '2022-06-01T00:00:00Z',
    resolved_at: null,

    notes: '벤치프레스에서 발생. 헥스 프레스(뉴트럴 그립 덤벨)나 머신 체스트프레스가 부담이 적음.',
  },

  // ===== 손목 건초염 =====
  {
    id: 'injury_wrist_001',
    user_id: 'me',

    body_region_id: 'wrist',

    injury_description: '손목 건초염',

    status: 'recovering',
    caution_level: 'low',

    // 손목은 동작보다 그립과 부하 위치가 영향이 큼.
    // 직접 부하가 손목에 실리는 동작들:
    // - elbow_flexion: 컬 계열 (특히 바벨컬의 supinated 그립)
    // - hip_hinge: 데드리프트의 그립 부담
    // - vertical_pull: 풀업류의 매달리기 부담
    affected_patterns: ['elbow_flexion', 'hip_hinge', 'vertical_pull'],

    // 손목 건초염은 그립 종류가 직접적 영향:
    // - pronated: 프로네이트(오버핸드) — 손목이 꺾인 채로 부하
    // - supinated: 수피네이트(언더핸드) — 회전 부담 (특히 바벨컬)
    // 뉴트럴 그립이 가장 안전 → 시스템이 자동으로 우선 추천
    affected_grips: ['pronated', 'supinated'],

    // low 주의 + recovering: 보수적 증량 0.7
    conservative_increment_factor: 0.7,

    // 손목은 직접 운동이 적어 볼륨 캡은 0.9
    volume_cap_factor: 0.9,

    auto_status_update_enabled: true,

    last_pain_log_at: null,
    last_status_change_at: null,

    started_at: '2025-10-20T00:00:00Z',
    resolved_at: null,

    notes: '뉴트럴 그립(해머컬, EZ바컬)이나 케이블 핸들 변형이 부담이 적음. 데드리프트 시 손목 랩 사용 고려.',
  },
];

export default myInjuryProfiles;
