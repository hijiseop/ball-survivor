// client/game.js — 클라이언트 메인 (조립 + 초기화)

import * as Network   from './network.js';
import * as Input     from './input.js';
import * as Renderer  from './renderer.js';
import * as KillFeed  from './hud/killfeed.js';
import { ZOOM, SERVER_TICK_MS } from '/shared/constants.js';

// ── 상태 ──────────────────────────────────────────────────────
let myId       = null;
let character  = null;
let joined     = false;

// 서버 상태 보간용 (이전 / 현재)
let prevPlayers   = [];
let currPlayers   = [];
let currItems     = [];
let currSafeZones = [];
let stateTime     = 0;

// 관전 모드
let spectateTargetId = null;  // null = 내 시점, string = 관전 대상

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
    Input.onSkillInput((slotIndex) => {
        if (joined) Network.sendSkill(slotIndex);
    });
    Input.onSpectateInput((dir) => {
        if (spectateTargetId === null) return;
        const alive = currPlayers.filter(p => p.alive);
        if (alive.length === 0) return;
        const idx = alive.findIndex(p => p.id === spectateTargetId);
        const nextIdx = (idx + dir + alive.length) % alive.length;
        spectateTargetId = alive[nextIdx].id;
    });

    // 4. Socket.io 연결 + 이벤트 핸들러
    Network.connect();

    Network.on('welcome', ({ id }) => {
        myId = id;
        // 서버가 세션에서 캐릭터 정보를 읽으므로 빈 join 전송
        Network.join();
        joined = true;
    });

    Network.on('state', state => {
        prevPlayers   = currPlayers;
        currPlayers   = state.players;
        currItems     = state.items || [];
        currSafeZones = state.safeZones || [];
        stateTime     = Date.now();

        // 관전 모드 자동 전환
        const me = currPlayers.find(p => p.id === myId);
        if (me && !me.alive && spectateTargetId === null) {
            // 사망 시 첫 생존자로 관전 시작
            const alive = currPlayers.filter(p => p.alive && p.id !== myId);
            if (alive.length > 0) spectateTargetId = alive[0].id;
        } else if (me && me.alive && spectateTargetId !== null) {
            // 부활 시 내 시점 복귀
            spectateTargetId = null;
        }
        // 관전 대상이 사망하면 다음 생존자로 전환
        if (spectateTargetId !== null) {
            const target = currPlayers.find(p => p.id === spectateTargetId);
            if (!target || !target.alive) {
                const alive = currPlayers.filter(p => p.alive);
                spectateTargetId = alive.length > 0 ? alive[0].id : null;
            }
        }
    });

    Network.on('hit', ({ targetId }) => {
        Renderer.notifyHit(targetId, myId);
    });

    Network.on('kill', ({ killerName, victimName }) => {
        KillFeed.addKill(killerName, victimName);
    });

    Network.on('itemPickup', (data) => {
        Renderer.notifyItemPickup(data);
    });

    Network.on('skillEffect', (data) => {
        Renderer.notifySkillEffect(data);
    });

    Network.on('legendaryDrop', ({ playerName, skillType }) => {
        Renderer.notifyLegendary(playerName, skillType);
        KillFeed.addKill(`✨ ${playerName}`, `전설 ${skillType} Lv4 획득!`);
    });

    Network.on('roomFull', () => {
        alert('방이 가득 찼습니다. (최대 20명)');
        window.location.href = '/';
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
    const t = stateTime > 0 ? (now - stateTime) / SERVER_TICK_MS : 0;

    Input.update();
    Renderer.render(prevPlayers, currPlayers, t, myId, now, currItems, currSafeZones, spectateTargetId);

    requestAnimationFrame(renderLoop);
}

// ── 시작 ──────────────────────────────────────────────────────
init();
