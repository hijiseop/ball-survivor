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

## 4. 모듈 시스템 마이그레이션 (⚠️ 주의)

현재 프로젝트는 **CommonJS** (`require`/`module.exports`).  
PvP 전환 시 **ES Modules** (`import`/`export`)로 전체 마이그레이션 필요.

| 파일 | 변경 사항 |
|------|---------|
| `package.json` | `"type": "commonjs"` → `"type": "module"`, `socket.io` 의존성 추가 |
| `server.js` | 삭제 → `server/index.js`로 통합 |
| `services/mapleStoryService.js` | `require` → `import`, `module.exports` → `export` |

---

## 5. File Structure

```
shared/
  constants.js          # 서버+클라 공유 상수 (월드, 틱, 전투, 히트박스)
  game-logic.js         # 서버+클라 공유 로직 (이동, 충돌, 데미지)

server/
  index.js              # Express + Socket.io 진입점 (기존 server.js 대체)
                        # - 기존 Auth API 라우트 유지 (/api/login, /api/select, /api/me, /api/logout)
                        # - Socket.io PvP 이벤트 추가
  game-room.js          # 20Hz 게임 틱 루프, 플레이어 관리, 브로드캐스트
  player.js             # Player 클래스

services/
  mapleStoryService.js  # Nexon API 래퍼 (ESM 변환 필요)

client/
  network.js            # Socket.io 클라이언트 연결/이벤트
  input.js              # 마우스 입력 → 월드 좌표 → network 전송
  renderer.js           # Canvas 렌더링 (보간 + 카메라 + HUD + 미니맵)
  game.js               # 클라이언트 메인 (조립 + 초기화)

templates/
  index.html            # 로그인 + 캐릭터 선택 페이지 (기존 유지)
  game.html             # PvP 게임 페이지 (Socket.io 클라이언트 스크립트 추가)

public/
  battlemap.png         # 배경 이미지 (기존 templates/battlemap.png → 이동)
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
| S→C | `kill` | `{ killerId, victimId }` |
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
export const ACTION_STAND = 'A00';
export const ACTION_WALK = 'A02';
export const ACTION_ATTACKS = ['A13', 'A14', 'A15'];
```

---

## 12. shared/game-logic.js

이동 계산, 충돌 판정, 데미지 적용. 서버가 권위적으로 사용, 클라이언트는 예측/보간용.

- `updatePosition(player, dt)` — 델타타임 기반 이동 + 맵 경계 클램프
- `checkAttackHit(attacker, target)` — 히트박스 중심 거리 기반 범위 판정
- `applyDamage(target, damage, now)` — 무적 시간 체크 후 HP 차감

---

## 13. Environment Variables

```
NEXON_API_KEY=     # Nexon Open API 키
SESSION_SECRET=    # express-session 서명 키 (없으면 기본값 사용)
PORT=3000          # 서버 포트 (선택)
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

## 15. 향후 확장 (현재 구현 범위 외)

- 리스폰 (사망 후 3초 뒤 랜덤 위치)
- 킬로그 피드
- 킬 수 기준 실시간 리더보드
- 축소 존 (배틀로얄 존)
- HP 회복 아이템 드롭
