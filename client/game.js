// client/game.js — 클라이언트 메인 (조립 + 초기화)

import * as Network  from './network.js';
import * as Input    from './input.js';
import * as Renderer from './renderer.js';
import { ZOOM, SERVER_TICK_MS } from '/shared/constants.js';

// ── 상태 ──────────────────────────────────────────────────────
let myId       = null;
let character  = null;
let joined     = false;

// 서버 상태 보간용 (이전 / 현재)
let prevPlayers = [];
let currPlayers = [];
let stateTime   = 0;

// ── 진입점 ────────────────────────────────────────────────────
async function init() {
    // 1. 세션의 캐릭터 정보 확인
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    character = await res.json();

    document.getElementById('loading').textContent = '연결 중...';

    // 2. Canvas / 배경 초기화
    await Renderer.init();

    // 3. Input 리스너 등록
    Input.init(Renderer.getCanvas());

    // 4. Socket.io 연결 + 이벤트 핸들러
    Network.connect();

    Network.on('welcome', ({ id }) => {
        myId = id;
        // 서버가 세션에서 캐릭터 정보를 읽으므로 빈 join 전송
        Network.join();
        joined = true;
    });

    Network.on('state', state => {
        prevPlayers = currPlayers;
        currPlayers = state.players;
        stateTime   = Date.now();
    });

    Network.on('hit', ({ targetId }) => {
        Renderer.notifyHit(targetId);
    });

    Network.on('kill', () => {
        // TODO: 킬 로그 표시
    });

    Network.on('disconnect', () => {
        alert('서버 연결이 끊겼습니다.');
        window.location.href = '/';
    });

    // 5. 입력 전송 루프 (~20Hz, 서버 틱과 동기화)
    setInterval(() => {
        if (!joined || myId === null) return;
        const target = Input.getWorldTarget(Renderer.getCamX(), Renderer.getCamY(), ZOOM);
        Network.sendInput(target.x, target.y);
    }, SERVER_TICK_MS);

    // 6. 렌더 루프 시작
    requestAnimationFrame(renderLoop);
}

// ── 렌더 루프 ─────────────────────────────────────────────────
function renderLoop() {
    const now = Date.now();
    // stateTime 기준으로 보간 계수 t 계산 (0 → 1+)
    const t = stateTime > 0 ? (now - stateTime) / SERVER_TICK_MS : 0;

    Renderer.render(prevPlayers, currPlayers, t, myId, now);

    requestAnimationFrame(renderLoop);
}

// ── 시작 ──────────────────────────────────────────────────────
init();
