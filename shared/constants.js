// 월드
export const WORLD_W = 1920;
export const WORLD_H = 1080;

// 서버
export const SERVER_TICK_RATE = 20;        // Hz
export const SERVER_TICK_MS = 1000 / 20;   // 50ms

// 캐릭터 이동
export const CHAR_SPEED = 300;             // px/초
export const STOP_DIST = 10;

// 전투
export const ATTACK_INTERVAL = 5000;       // 자동 공격 주기 (ms)
export const ATTACK_DURATION = 360;        // 공격 모션 지속 (ms)
export const ATTACK_RANGE = 33;            // 공격 히트 범위 (px, 히트박스 모서리 기준)
export const INVINCIBLE_MS = 1500;         // 피격 후 무적 시간

// 히트박스 (캐릭터 중심 기준 오프셋)
export const HIT_W = 30;
export const HIT_H = 48;
export const HIT_OFFSET_X = -3;
export const HIT_OFFSET_Y = 8;

// 캐릭터 렌더 (클라이언트 전용이지만 공유해도 무방)
export const CHAR_SCALE = 0.6;
export const ZOOM = 1.3;
export const FRAME_MS = 120;

// 공간 분할 그리드
export const GRID_CELL_SIZE = 100;         // px, 공격 범위(~72px)보다 크게
export const MAX_PLAYERS = 20;             // 방 최대 인원

// 스프라이트 액션 코드
export const ACTION_STAND = 'A00';
export const ACTION_WALK = 'A02';
export const ACTION_ATTACKS = ['A13', 'A14', 'A15'];
