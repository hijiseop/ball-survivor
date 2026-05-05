# Ball Survivor PvP — SPEC.md

## 1. Overview

기존 싱글플레이어 Ball Survivor를 **실시간 멀티플레이어 PvP 배틀로얄**로 전환.
Nexon Open API로 인증한 사용자의 메이플스토리 캐릭터가 실시간으로 대전.
서버 권위적(authoritative) 구조 — 서버가 모든 게임 로직의 권위자.

---

## 2. Architecture

```
[index.html] → 로그인(API Key) → 캐릭터 선택
     ↓
[game.html] → Socket.io 연결 → [server/index.js]
                                    ├── Express (Auth API + 정적 서빙)
                                    ├── Socket.io (실시간 게임)
                                    └── GameRoom (20Hz 틱 루프)
```

---

## 3. Tech Stack

- **런타임**: Node.js (ES Modules — `"type": "module"`)
- **서버**: Express 5 + Socket.io 4
- **클라이언트**: Vanilla JS + Canvas (ES Modules)
- **API**: Nexon Open API (캐릭터 인증)
- **세션**: express-session (로그인 유지)

---

## 4. File Structure

```
shared/
  constants.js          # 서버+클라 공유 상수 (월드, 틱, 전투, 히트박스, 그리드, 장애물)
  game-logic.js         # 서버+클라 공유 로직 (이동, 장애물 충돌, 데미지)

server/
  index.js              # Express + Socket.io 진입점
                        # - Auth API (/api/login, /api/select, /api/me, /api/logout)
                        # - Socket.io PvP 이벤트
  game-room.js          # 20Hz 게임 틱 루프, 그리드 공간 분할, 플레이어 관리
  player.js             # Player 클래스
  services/
    mapleStoryService.js  # Nexon Open API 래퍼

client/
  game.js               # 클라이언트 메인 (조립 + 초기화)
  network.js            # Socket.io 클라이언트 연결/이벤트
  input.js              # 마우스/터치/스킬 입력 → 월드 좌표 변환
  renderer.js           # Canvas 렌더링 조립 (보간 + 카메라 + 월드/HUD 레이어)
  hud/
    killfeed.js         # 킬로그 피드 (좌측 하단, fade-out)
    leaderboard.js      # 실시간 리더보드 (우측 상단, 킬 수 기준)
  effects/
    pickup-effects.js   # 아이템 보상/저주 픽업 이펙트

templates/
  index.html            # 로그인 + 캐릭터 선택
  game.html             # PvP 게임 페이지

public/
  battlemap.png         # 배경 이미지
```

---

## 6. package.json 변경

```json
{
  "name": "ball-survivor-pvp",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js"
  },
  "dependencies": {
    "axios": "^1.15.0",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "express-session": "^1.19.0",
    "socket.io": "^4.7.0"
  }
}
```

---

## 7. Auth Flow (기존 유지)

```
POST /api/login        { apiKey }          → 세션 저장, 캐릭터 목록 반환
POST /api/select       { character_name }  → 캐릭터 정보 조회, 세션 저장
GET  /api/me                               → 세션의 캐릭터 정보 반환
POST /api/logout                           → 세션 삭제
GET  /game             (requireAuth)       → game.html 반환
GET  /                                     → index.html 반환
```

`/game` 라우트는 기존과 동일하게 `requireAuth` + `selectedCharacter` 검증 유지.

---

## 8. Socket.io 이벤트 프로토콜

| 방향 | 이벤트명 | 페이로드 |
|------|---------|---------|
| C→S | `join` | `{ characterName, characterLevel, combatPower, characterImageUrl }` |
| C→S | `input` | `{ targetX, targetY }` |
| S→C | `welcome` | `{ id, worldW, worldH, tickRate }` |
| S→C | `state` | `{ tick, players: [{ id, name, x, y, hp, maxHp, facingRight, attackUntil, alive, kills, characterImageUrl }] }` |
| S→C | `hit` | `{ attackerId, targetId, damage, targetHp }` |
| S→C | `kill` | `{ killerId, killerName, victimId, victimName }` |
| S→C | `playerJoin` | `{ id, name }` |
| S→C | `playerLeave` | `{ id }` |

---

## 9. game.html PvP 변경사항

기존 `templates/game.html`은 모놀리식 싱글플레이 JS 코드를 포함.  
PvP 전환 시 인라인 `<script>` 전체 제거 후 아래 구조로 교체:

```html
<!-- Socket.io 클라이언트 (서버에서 자동 서빙) -->
<script src="/socket.io/socket.io.js"></script>
<!-- PvP 게임 클라이언트 메인 -->
<script type="module" src="/client/game.js"></script>
```

기존 `#backBtn`, `#loading`, `#gameCanvas` 요소는 유지.

---

## 10. 정적 파일 서빙 변경

| 경로 | 서빙 폴더 | 비고 |
|------|---------|------|
| `/shared/*` | `shared/` | 클라이언트에서 import 가능하도록 |
| `/client/*` | `client/` | ES Module 클라이언트 코드 |
| `/` (정적) | `public/` | battlemap.png 등 에셋 |
| `GET /` | `templates/index.html` | 명시적 라우트 |
| `GET /game` | `templates/game.html` | requireAuth 미들웨어 |

**⚠️ battlemap.png**: `templates/battlemap.png` → `public/battlemap.png` 이동 필요.  
기존 game.html에서 `/battlemap.png`로 참조 중 — 경로 변경 없이 동작 가능 (public/ 정적 서빙).

---

## 11. shared/constants.js

서버와 클라이언트가 공유하는 모든 상수. 게임 밸런스 조정 시 이 파일만 수정.

```js
export const WORLD_W = 1920;
export const WORLD_H = 1080;
export const SERVER_TICK_RATE = 20;         // Hz
export const SERVER_TICK_MS = 1000 / 20;    // 50ms
export const CHAR_SPEED = 300;              // px/초
export const STOP_DIST = 10;
export const ATTACK_INTERVAL = 5000;        // ms
export const ATTACK_DURATION = 360;         // ms
export const ATTACK_RANGE = 60;             // px
export const INVINCIBLE_MS = 1500;          // ms
export const HIT_W = 30;
export const HIT_H = 50;
export const HIT_OFFSET_X = -5;
export const HIT_OFFSET_Y = 11;
export const CHAR_SCALE = 0.6;
export const ZOOM = 1.3;
export const FRAME_MS = 120;
export const MAP_OBSTACLES = [
  { id: 'north-ruin', x: 760, y: 155, w: 270, h: 72, label: 'ruin' },
  // ...
];
export const ACTION_STAND = 'A00';
export const ACTION_WALK = 'A02';
export const ACTION_ATTACKS = ['A13', 'A14', 'A15'];
```

---

## 12. shared/game-logic.js

이동 계산, 충돌 판정, 데미지 적용. 서버가 권위적으로 사용, 클라이언트는 예측/보간용.

- `updatePosition(player, dt)` — 델타타임 기반 이동 + 맵 경계 클램프 + 장애물 충돌
- `isBlockedPosition(x, y)` — 플레이어 히트박스 기준 장애물 충돌 판정
- `randomOpenPosition()` — 장애물과 겹치지 않는 스폰/아이템 위치 선택
- `checkAttackHit(attacker, target)` — 히트박스 중심 거리 기반 범위 판정
- `applyDamage(target, damage, now)` — 무적 시간 체크 후 HP 차감

---

## 13. Environment Variables

```
SESSION_SECRET=    # express-session 서명 키 (필수)
PORT=3000          # 서버 포트 (선택, 기본 3000)
```

---

## 14. 실행

```bash
npm install
node server/index.js
# 브라우저에서 http://localhost:3000
# 탭 여러 개로 멀티플레이 테스트 가능
```

---

## 15. 향후 확장

- 리스폰 (사망 후 3초 뒤 랜덤 위치)
- 축소 존 (배틀로얄 존)
- HP 회복 아이템 드롭

---

## 16. 아이템/저주 정책

- 빈 스킬 슬롯이 하나라도 있으면 아이템은 Lv1~Lv3 스킬 보상만 제공한다.
- 저주는 스킬 슬롯 3개가 모두 찬 뒤부터 일반 아이템 롤 실패 구간에서만 발생한다.
- Lv4는 슬롯이 꽉 찬 Lv3 보유자에게만 선판정되며, 저주가 아닌 전설 보상이다.
- 같은 타입의 같거나 낮은 레벨 아이템, 또는 교체 가능한 슬롯이 없는 아이템은 소비하지 않고 맵에 남긴다.
