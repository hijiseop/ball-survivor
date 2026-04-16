# Ball Survivor → PvP 배틀로얄 전환 명세서

## 프로젝트 개요

기존 싱글플레이어 Ball Survivor를 실시간 멀티플레이어 PvP 배틀로얄로 전환.
세포키우기처럼 인원 제한 없이 접속 가능. 서버 권위적(authoritative) 구조.

---

## CLAUDE.md (프로젝트 루트에 배치)

```markdown
# Ball Survivor PvP

## 프로젝트 구조
```
shared/constants.js      # 서버+클라 공유 상수
shared/game-logic.js     # 서버+클라 공유 로직 (이동, 충돌, 데미지)
server/index.js          # Express + Socket.io 진입점
server/game-room.js      # 게임 틱 루프, 플레이어 관리, 브로드캐스트
server/player.js         # Player 클래스
client/network.js        # Socket.io 클라이언트 연결/이벤트
client/input.js          # 마우스 입력 → network 전송
client/renderer.js       # Canvas 렌더링 + 보간 + 카메라 + HUD + 미니맵
client/game.js           # 클라이언트 메인 (조립)
templates/game.html      # HTML 진입점 (script 태그로 client/ 로드)
public/battlemap.png     # 배경 이미지
```

## 핵심 규칙
- 서버가 모든 게임 로직의 권위자 (이동, 충돌, 데미지, 사망)
- 클라이언트는 입력 전송 + 렌더링만 담당
- shared/ 폴더의 코드는 서버와 클라이언트 양쪽에서 import
- Socket.io 이벤트명은 이 문서의 "이벤트 프로토콜" 섹션 준수
- 서버 틱: 20Hz (50ms), 클라이언트 렌더: requestAnimationFrame (60fps)

## 이벤트 프로토콜 (Socket.io)
| 방향 | 이벤트명 | 페이로드 |
|------|---------|---------|
| C→S | `join` | `{ characterName, characterLevel, combatPower, characterImageUrl }` |
| C→S | `input` | `{ targetX, targetY, seq }` |
| S→C | `welcome` | `{ id, worldW, worldH, tickRate }` |
| S→C | `state` | `{ tick, players: [{ id, x, y, hp, maxHp, facingRight, animState, attackUntil }] }` |
| S→C | `hit` | `{ attackerId, targetId, damage, targetHp }` |
| S→C | `kill` | `{ killerId, victimId }` |
| S→C | `playerJoin` | `{ id, name }` |
| S→C | `playerLeave` | `{ id }` |

## 기술 스택
- Node.js + Express + Socket.io (서버)
- Vanilla JS + Canvas (클라이언트)
- 모듈: ES Modules (`type: "module"` in package.json)

## 실행
```bash
npm install
node server/index.js
# 브라우저에서 http://localhost:3000
```
```

---

## 파일별 상세 명세

---

### 1. shared/constants.js

**역할**: 서버와 클라이언트가 공유하는 모든 상수

```js
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
export const ATTACK_RANGE = 60;            // 공격 히트 범위 (px, 캐릭터 중심 기준)
export const INVINCIBLE_MS = 1500;         // 피격 후 무적 시간

// 히트박스 (캐릭터 중심 기준 오프셋)
export const HIT_W = 30;
export const HIT_H = 50;
export const HIT_OFFSET_X = -5;
export const HIT_OFFSET_Y = 11;

// 캐릭터 렌더 (클라이언트 전용이지만 공유해도 무방)
export const CHAR_SCALE = 0.6;
export const ZOOM = 1.3;
export const FRAME_MS = 120;

// 스프라이트 액션 코드
export const ACTION_STAND = 'A00';
export const ACTION_WALK = 'A02';
export const ACTION_ATTACKS = ['A13', 'A14', 'A15'];
```

---

### 2. shared/game-logic.js

**역할**: 이동 계산, 충돌 판정, 데미지 적용. 서버가 권위적으로 사용하고, 클라이언트는 예측/보간용으로 사용.

```js
import { CHAR_SPEED, STOP_DIST, WORLD_W, WORLD_H,
         HIT_W, HIT_H, HIT_OFFSET_X, HIT_OFFSET_Y,
         ATTACK_RANGE, INVINCIBLE_MS } from './constants.js';

/**
 * 플레이어 위치 업데이트
 * @param {Object} player - { x, y, targetX, targetY }
 * @param {number} dt - 초 단위 델타타임
 * @returns {{ moved: boolean, facingRight: boolean }}
 */
export function updatePosition(player, dt) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= STOP_DIST) return { moved: false };

    const step = CHAR_SPEED * dt;
    const move = Math.min(step, dist);
    player.x += (dx / dist) * move;
    player.y += (dy / dist) * move;

    // 맵 경계 제한
    player.x = Math.max(0, Math.min(player.x, WORLD_W));
    player.y = Math.max(0, Math.min(player.y, WORLD_H));

    return { moved: true, facingRight: dx > 5 ? true : dx < -5 ? false : undefined };
}

/**
 * 공격 히트 판정 (공격자 vs 대상)
 * 공격자의 히트박스 중심으로부터 ATTACK_RANGE 이내에 대상 히트박스가 있는지 체크
 */
export function checkAttackHit(attacker, target) {
    const ax = attacker.x + HIT_OFFSET_X;
    const ay = attacker.y + HIT_OFFSET_Y;
    const tx = target.x + HIT_OFFSET_X;
    const ty = target.y + HIT_OFFSET_Y;

    const dx = ax - tx;
    const dy = ay - ty;
    return Math.sqrt(dx * dx + dy * dy) < ATTACK_RANGE;
}

/**
 * 데미지 적용
 * @returns {{ died: boolean, applied: boolean }}
 */
export function applyDamage(target, damage, now) {
    if (now < target.invincibleUntil) return { died: false, applied: false };

    target.hp -= damage;
    target.invincibleUntil = now + INVINCIBLE_MS;

    if (target.hp <= 0) {
        target.hp = 0;
        return { died: true, applied: true };
    }
    return { died: false, applied: true };
}
```

---

### 3. server/player.js

**역할**: 플레이어 상태 클래스

```js
import { WORLD_W, WORLD_H, ATTACK_INTERVAL } from '../shared/constants.js';

export class Player {
    constructor(id, charData) {
        this.id = id;
        this.name = charData.characterName || 'Unknown';
        this.characterImageUrl = charData.characterImageUrl || '';

        // 위치 (랜덤 스폰)
        this.x = 100 + Math.random() * (WORLD_W - 200);
        this.y = 100 + Math.random() * (WORLD_H - 200);
        this.targetX = this.x;
        this.targetY = this.y;

        // 스탯
        this.maxHp = charData.characterLevel || 100;
        this.hp = this.maxHp;
        this.combatPower = charData.combatPower || 10;
        this.damage = Math.max(1, Math.floor(this.combatPower / 10));

        // 전투 상태
        this.facingRight = false;
        this.invincibleUntil = 0;
        this.lastAttackTime = 0;
        this.attackUntil = 0;

        // 통계
        this.kills = 0;
        this.alive = true;
    }

    /** 직렬화 (state 브로드캐스트용) */
    serialize() {
        return {
            id: this.id,
            name: this.name,
            x: Math.round(this.x),
            y: Math.round(this.y),
            hp: this.hp,
            maxHp: this.maxHp,
            facingRight: this.facingRight,
            attackUntil: this.attackUntil,
            alive: this.alive,
            kills: this.kills,
            characterImageUrl: this.characterImageUrl,
        };
    }
}
```

---

### 4. server/game-room.js

**역할**: 20Hz 게임 루프. 모든 플레이어 이동 + 자동 공격 + 판정 + 브로드캐스트.

```js
import { SERVER_TICK_MS, ATTACK_INTERVAL, ATTACK_DURATION }
    from '../shared/constants.js';
import { updatePosition, checkAttackHit, applyDamage }
    from '../shared/game-logic.js';
import { Player } from './player.js';

export class GameRoom {
    constructor(io) {
        this.io = io;
        this.players = new Map(); // socketId → Player
        this.tick = 0;
        this.interval = null;
    }

    start() {
        this.interval = setInterval(() => this.update(), SERVER_TICK_MS);
    }

    addPlayer(socketId, charData) {
        const player = new Player(socketId, charData);
        this.players.set(socketId, player);
        return player;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
    }

    handleInput(socketId, data) {
        const p = this.players.get(socketId);
        if (!p || !p.alive) return;
        p.targetX = data.targetX;
        p.targetY = data.targetY;
    }

    update() {
        const now = Date.now();
        const dt = SERVER_TICK_MS / 1000;
        this.tick++;

        const alivePlayers = [];

        // 1) 이동 업데이트
        for (const p of this.players.values()) {
            if (!p.alive) continue;
            alivePlayers.push(p);
            const result = updatePosition(p, dt);
            if (result.moved && result.facingRight !== undefined) {
                p.facingRight = result.facingRight;
            }
        }

        // 2) 자동 공격 + 판정
        for (const attacker of alivePlayers) {
            // 공격 쿨타임 체크
            if (now - attacker.lastAttackTime < ATTACK_INTERVAL) continue;

            // 가장 가까운 적 찾기
            let nearest = null, nearDist = Infinity;
            for (const target of alivePlayers) {
                if (target.id === attacker.id) continue;
                const dx = attacker.x - target.x;
                const dy = attacker.y - target.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < nearDist) { nearDist = d; nearest = target; }
            }

            if (!nearest) continue;

            // 공격 범위 내에 적이 있으면 공격
            if (checkAttackHit(attacker, nearest)) {
                attacker.lastAttackTime = now;
                attacker.attackUntil = now + ATTACK_DURATION;

                const { died, applied } = applyDamage(nearest, attacker.damage, now);
                if (applied) {
                    this.io.emit('hit', {
                        attackerId: attacker.id,
                        targetId: nearest.id,
                        damage: attacker.damage,
                        targetHp: nearest.hp,
                    });
                }
                if (died) {
                    nearest.alive = false;
                    attacker.kills++;
                    this.io.emit('kill', {
                        killerId: attacker.id,
                        victimId: nearest.id,
                    });
                }
            }
        }

        // 3) 상태 브로드캐스트
        const state = {
            tick: this.tick,
            players: Array.from(this.players.values()).map(p => p.serialize()),
        };
        this.io.emit('state', state);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }
}
```

---

### 5. server/index.js

**역할**: Express 서버 + Socket.io 셋업 + 정적 파일 서빙

```js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameRoom } from './game-room.js';
import { WORLD_W, WORLD_H, SERVER_TICK_RATE } from '../shared/constants.js';

const app = express();
const http = createServer(app);
const io = new Server(http);

// 정적 파일
app.use('/shared', express.static('shared'));
app.use('/client', express.static('client'));
app.use(express.static('public'));

// HTML 진입점
app.get('/', (req, res) => res.sendFile('game.html', { root: 'templates' }));

// 게임 룸
const room = new GameRoom(io);
room.start();

// 소켓 연결
io.on('connection', (socket) => {
    console.log(`연결: ${socket.id}`);

    socket.on('join', (charData) => {
        const player = room.addPlayer(socket.id, charData);
        socket.emit('welcome', {
            id: socket.id,
            worldW: WORLD_W,
            worldH: WORLD_H,
            tickRate: SERVER_TICK_RATE,
        });
        io.emit('playerJoin', { id: socket.id, name: player.name });
    });

    socket.on('input', (data) => {
        room.handleInput(socket.id, data);
    });

    socket.on('disconnect', () => {
        room.removePlayer(socket.id);
        io.emit('playerLeave', { id: socket.id });
        console.log(`끊김: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`서버: http://localhost:${PORT}`));
```

---

### 6. client/network.js

**역할**: Socket.io 연결, 이벤트 송수신 래핑

```js
// Socket.io는 game.html의 <script> 태그로 로드됨 (전역 io)
export class Network {
    constructor() {
        this.socket = null;
        this.myId = null;
        this.onState = null;    // (state) => void
        this.onWelcome = null;  // (data) => void
        this.onHit = null;      // (data) => void
        this.onKill = null;     // (data) => void
        this.onPlayerJoin = null;
        this.onPlayerLeave = null;
    }

    connect() {
        this.socket = io();

        this.socket.on('welcome', (data) => {
            this.myId = data.id;
            this.onWelcome?.(data);
        });
        this.socket.on('state', (data) => this.onState?.(data));
        this.socket.on('hit', (data) => this.onHit?.(data));
        this.socket.on('kill', (data) => this.onKill?.(data));
        this.socket.on('playerJoin', (data) => this.onPlayerJoin?.(data));
        this.socket.on('playerLeave', (data) => this.onPlayerLeave?.(data));
    }

    join(charData) {
        this.socket.emit('join', charData);
    }

    sendInput(targetX, targetY) {
        this.socket.emit('input', { targetX, targetY });
    }
}
```

---

### 7. client/input.js

**역할**: 마우스 이벤트 → 월드 좌표 변환 → network.sendInput()

```js
import { ZOOM } from '../shared/constants.js';

export class InputHandler {
    constructor(canvas, network) {
        this.canvas = canvas;
        this.network = network;
        this.screenMx = 0;
        this.screenMy = 0;
        this.camX = 0;  // renderer에서 매 프레임 업데이트
        this.camY = 0;

        canvas.addEventListener('mousemove', (e) => {
            const r = canvas.getBoundingClientRect();
            this.screenMx = e.clientX - r.left;
            this.screenMy = e.clientY - r.top;
        });
    }

    /** renderer에서 카메라 위치 동기화 */
    updateCamera(cx, cy) {
        this.camX = cx;
        this.camY = cy;
    }

    /** 매 프레임 호출 — 서버에 입력 전송 */
    sendToServer() {
        const wx = this.screenMx / ZOOM + this.camX;
        const wy = this.screenMy / ZOOM + this.camY;
        this.network.sendInput(wx, wy);
    }
}
```

---

### 8. client/renderer.js

**역할**: Canvas 렌더링 전담. 서버에서 받은 state를 보간하여 60fps로 그림.

**핵심 기능:**
- 배경 이미지, 카메라+줌 (기존과 동일)
- **모든 플레이어** 렌더링 (내 캐릭터 + 다른 플레이어)
- 보간(interpolation): 이전 서버 state → 현재 서버 state 사이를 lerp
- 각 플레이어 머리 위 이름 + HP바
- 미니맵에 모든 플레이어 표시
- HUD: 내 HP, 킬 수, 생존자 수
- 사망 시 관전 모드 (카메라가 킬러를 따라감)

**스프라이트 로딩:**
- 각 플레이어의 `characterImageUrl`로 스프라이트 프리로드
- `Map<playerId, { stand[], walk[], A13[], A14[], A15[] }>` 캐시
- 새 플레이어 입장 시 비동기 로드, 로드 전엔 기본 원으로 표시

**보간 구현 가이드:**
```
prevState, currState 두 개 유지
렌더 시 t = (now - lastStateTime) / tickInterval (0~1)
각 플레이어 위치 = lerp(prev.x, curr.x, t)
```

**카메라:**
- 기존 updateCamera 로직 그대로 (줌 적용)
- 내 플레이어 기준으로 추적
- 사망 시 킬러 또는 다른 생존자 추적

---

### 9. client/game.js

**역할**: 클라이언트 메인. 모듈 조립 + 초기화.

```js
import { Network } from './network.js';
import { InputHandler } from './input.js';
// Renderer는 별도 import

// 1. 캐릭터 정보 가져오기 (기존 /api/me 또는 로컬스토리지 등)
// 2. Canvas 셋업
// 3. Network 연결
// 4. welcome 수신 → Renderer 초기화
// 5. 렌더 루프 시작 (requestAnimationFrame)
//    - inputHandler.sendToServer()
//    - renderer.render(latestState)
```

---

### 10. templates/game.html

**역할**: HTML 진입점. Socket.io + 클라이언트 모듈 로드.

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ball Survivor PvP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        #gameCanvas { display: block; cursor: none; }
    </style>
</head>
<body>
    <canvas id="gameCanvas"></canvas>
    <script src="/socket.io/socket.io.js"></script>
    <script type="module" src="/client/game.js"></script>
</body>
</html>
```

---

### 11. package.json

```json
{
    "name": "ball-survivor-pvp",
    "type": "module",
    "scripts": {
        "start": "node server/index.js",
        "dev": "node --watch server/index.js"
    },
    "dependencies": {
        "express": "^4.18.0",
        "socket.io": "^4.7.0"
    }
}
```

---

## Claude Code 병렬 에이전트 가이드

### SHARED.md 또는 오케스트레이터 프롬프트

```
이 프로젝트는 Ball Survivor PvP 배틀로얄 게임이다.
CLAUDE.md를 반드시 먼저 읽고, 이벤트 프로토콜을 준수할 것.
shared/ 폴더의 코드는 서버와 클라이언트 양쪽에서 import한다.
```

### 에이전트 분배

| 에이전트 | 담당 파일 | 의존성 |
|---------|----------|-------|
| Agent 1 (shared) | `shared/constants.js`, `shared/game-logic.js` | 없음 (먼저 완성) |
| Agent 2 (server) | `server/player.js`, `server/game-room.js`, `server/index.js`, `package.json` | shared/ 완성 후 |
| Agent 3 (client) | `client/network.js`, `client/input.js`, `client/renderer.js`, `client/game.js`, `templates/game.html` | shared/ 완성 후 |

### 권장 순서

1. **Agent 1** → shared 완성 (5분)
2. **Agent 2 + Agent 3** 동시 시작 (각 15-20분)
3. 통합 테스트: `npm install && npm start` → 탭 2개로 확인

---

## 향후 확장 포인트 (지금은 안 만들어도 됨)

- **리스폰**: 사망 후 3초 뒤 랜덤 위치 리스폰
- **킬로그**: 화면에 "A가 B를 처치" 피드
- **리더보드**: 킬 수 기준 실시간 순위
- **축소 존**: 시간이 지나면 맵 경계가 줄어드는 배틀로얄 존
- **아이템 드롭**: 맵에 HP 회복 아이템 스폰
