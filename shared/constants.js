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

// 리스폰
export const RESPAWN_DELAY_MS = 3000;      // 사망 후 부활 대기 (ms)
export const RESPAWN_INVINCIBLE_MS = 2000; // 부활 후 무적 시간 (ms)

// 게임 종료
export const GAME_RESTART_DELAY_MS = 5000; // 게임 종료 후 재시작 대기 (ms)
export const MIN_PLAYERS_FOR_GAME = 2;     // 게임 종료 판정 최소 인원

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

// 스킬별 전용 모션
export const ACTION_SKILLS = {
    explosion: { action: 'A16', maxFrames: 4 },
    shield:    { action: 'A23', maxFrames: 4 },
    dash:      { action: 'A29', maxFrames: 4 },
    heal:      { action: 'A10', maxFrames: 3 },
};
export const SKILL_MOTION_MS = 480; // 스킬 모션 지속 시간

// ── 스킬 아이템 ──────────────────────────────────────────────────
export const MAX_SKILL_SLOTS    = 3;
export const MAX_ITEMS          = 5;
export const ITEM_SPAWN_INTERVAL = 15000; // ms
export const ITEM_EXPIRE_MS     = 10000;  // 10초 후 소멸
export const ITEM_BLINK_MS      = 3000;   // 마지막 3초 깜빡임
export const ITEM_PICKUP_RANGE  = 50;     // px

export const SKILL_TYPES = ['explosion', 'shield', 'dash', 'heal'];

// 아이템 레벨 확률 (누적)
export const ITEM_PROB_LV1   = 0.55;
export const ITEM_PROB_LV2   = 0.75;
export const ITEM_PROB_LV3   = 0.84;
// 0.84 ~ 1.00 = 저주 (16%)
export const ITEM_PROB_LV4   = 0.0005; // Lv3 보유자만, 별도 체크

// 레벨별 스킬 스탯 (인덱스 0=Lv1, 1=Lv2, 2=Lv3, 3=Lv4)
export const SKILL_STATS = {
    explosion: {
        cooldown: [15000, 13000, 10000, 6000],
        range:    [120,   156,   192,   240],
        dmgMult:  [2.0,   3.0,   4.5,   8.0],
    },
    shield: {
        cooldown:  [20000, 18000, 15000, 10000],
        duration:  [2000,  2500,  3000,  4000],
        reflect:   [0.5,   0.75,  1.0,   1.5],
    },
    dash: {
        cooldown:  [10000, 9000, 8000, 5000],
        distance:  [200,   260,  320,  400],
        aoeRange:  [0,     80,   120,  180],
        dmgMult:   [0,     1.5,  2.0,  3.0],
    },
    heal: {
        cooldown:   [25000, 22000, 18000, 12000],
        hpPercent:  [0.30,  0.45,  0.60,  1.00],
    },
};
