// client/renderer.js — Canvas 렌더링 (보간 + 카메라 + HUD + 미니맵)

import {
    WORLD_W, WORLD_H, ZOOM, CHAR_SCALE,
    HIT_W, HIT_OFFSET_X,
    FRAME_MS, ACTION_STAND, ACTION_WALK, ACTION_ATTACKS,
    INVINCIBLE_MS,
} from '/shared/constants.js';

// ── Canvas / Context ──────────────────────────────────────────
let canvas, ctx;
let VIEW_W, VIEW_H;

// ── 카메라 ────────────────────────────────────────────────────
let camX = 0, camY = 0;

// ── 배경 이미지 ───────────────────────────────────────────────
const bgImg = new Image();

// ── 미니맵 상수 ───────────────────────────────────────────────
const MM_W = 200;
const MM_PAD = 12;

// ── 이미지 캐시 (imageUrlBase → { stand, walk, A13, A14, A15 }) ──
const imageCache  = new Map(); // null = 로딩 중
const sizeCache   = new Map(); // imageUrlBase → 렌더 크기 정보

// ── 애니메이션 상태 (playerId → { key, frame, lastFrameTime, walkUntil }) ──
const animState   = new Map();

// ── 피격 시간 (playerId → hitAt ms) ─────────────────────────
const hitTimeMap  = new Map();

// ─────────────────────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────────────────────
export async function init() {
    bgImg.src = '/battlemap.png';
    await new Promise(resolve => {
        if (bgImg.complete && bgImg.naturalWidth) { resolve(); return; }
        bgImg.onload  = resolve;
        bgImg.onerror = resolve;
    });

    VIEW_W = Math.min(window.innerWidth,  WORLD_W);
    VIEW_H = Math.min(window.innerHeight, WORLD_H);

    canvas = document.getElementById('gameCanvas');
    canvas.width  = VIEW_W;
    canvas.height = VIEW_H;
    canvas.style.display = 'block';
    ctx = canvas.getContext('2d');

    document.getElementById('loading').style.display = 'none';
}

export function getCanvas() { return canvas; }
export function getCamX()   { return camX; }
export function getCamY()   { return camY; }

// ─────────────────────────────────────────────────────────────
// 피격 알림 (game.js에서 hit 이벤트 수신 시 호출)
// ─────────────────────────────────────────────────────────────
export function notifyHit(targetId) {
    hitTimeMap.set(targetId, Date.now());
}

// ─────────────────────────────────────────────────────────────
// 이미지 프리로드 헬퍼
// ─────────────────────────────────────────────────────────────
function preloadFrames(base, actionPrefix, maxFrames = 8) {
    const promises = Array.from({ length: maxFrames }, (_, i) =>
        new Promise(resolve => {
            const img = new Image();
            const t = setTimeout(() => resolve(null), 5000);
            img.onload  = () => { clearTimeout(t); resolve(img); };
            img.onerror = () => { clearTimeout(t); resolve(null); };
            img.src = `${base}?action=${actionPrefix}.${i}`;
        })
    );
    return Promise.all(promises).then(results => {
        const list = [];
        for (const img of results) { if (!img) break; list.push(img); }
        return list;
    });
}

async function loadPlayerImages(base) {
    if (imageCache.has(base)) return;
    imageCache.set(base, null); // 로딩 중 마킹

    const [stand, walk, ...attacks] = await Promise.all([
        preloadFrames(base, ACTION_STAND),
        preloadFrames(base, ACTION_WALK),
        ...ACTION_ATTACKS.map(a => preloadFrames(base, a)),
    ]);

    imageCache.set(base, { stand, walk, attacks });

    const sample = stand[0] || walk[0];
    if (sample) {
        const iw = sample.naturalWidth, ih = sample.naturalHeight;
        // hitW/hitH는 shared/constants.js의 서버 판정 기준 그대로 사용 (일관성)
        sizeCache.set(base, {
            charImgW:    Math.round(iw * CHAR_SCALE),
            charImgH:    Math.round(ih * CHAR_SCALE),
            charOffsetX: -Math.round((iw * CHAR_SCALE) / 2),
            charOffsetY: -Math.round((ih * CHAR_SCALE) / 2),
        });
    }
}

function getImageBase(url) {
    return url?.split('?')[0] ?? '';
}

// ─────────────────────────────────────────────────────────────
// 애니메이션 상태 업데이트 + 현재 프레임 반환
// ─────────────────────────────────────────────────────────────
function resolveFrame(player, base, now) {
    if (!animState.has(player.id)) {
        animState.set(player.id, { key: 'stand', frame: 0, lastFrameTime: now, walkUntil: 0 });
    }
    const anim = animState.get(player.id);

    const isAttacking = now < player.attackUntil;
    const isWalking   = !isAttacking && now < anim.walkUntil;
    const nextKey     = isAttacking ? 'attack' : isWalking ? 'walk' : 'stand';

    if (nextKey !== anim.key) {
        anim.key = nextKey;
        anim.frame = 0;
        anim.lastFrameTime = now;
    }
    if (now - anim.lastFrameTime >= FRAME_MS) {
        anim.frame++;
        anim.lastFrameTime = now;
    }

    const frames = imageCache.get(base);
    if (!frames) return null;

    if (isAttacking) {
        const seq = (frames.attacks ?? []).flat();
        return seq.length ? seq[anim.frame % seq.length] : null;
    }
    const pool = frames[isWalking ? 'walk' : 'stand'] ?? frames.stand;
    return pool?.length ? pool[anim.frame % pool.length] : null;
}

// ─────────────────────────────────────────────────────────────
// 카메라
// ─────────────────────────────────────────────────────────────
function updateCamera(wx, wy) {
    const vww = VIEW_W / ZOOM, vwh = VIEW_H / ZOOM;
    camX = Math.max(0, Math.min(wx - vww / 2, WORLD_W - vww));
    camY = Math.max(0, Math.min(wy - vwh / 2, WORLD_H - vwh));
}

// ─────────────────────────────────────────────────────────────
// 보간 헬퍼
// ─────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function interpPlayers(prevArr, currArr, t) {
    const prevMap = new Map(prevArr.map(p => [p.id, p]));
    const clampedT = Math.min(t, 1.5);

    return currArr.map(curr => {
        const prev = prevMap.get(curr.id);
        if (!prev) return curr;
        return {
            ...curr,
            x: lerp(prev.x, curr.x, clampedT),
            y: lerp(prev.y, curr.y, clampedT),
        };
    });
}

// ─────────────────────────────────────────────────────────────
// 메인 렌더
// ─────────────────────────────────────────────────────────────
export function render(prevPlayers, currPlayers, t, myId, now) {
    if (!ctx) return;

    // 보간된 플레이어 목록
    const players = interpPlayers(prevPlayers, currPlayers, t);
    const prevMap = new Map(prevPlayers.map(p => [p.id, p]));

    // 움직임 감지 → walkUntil 갱신
    for (const p of players) {
        const prev = prevMap.get(p.id);
        if (prev && (Math.abs(p.x - prev.x) > 0.5 || Math.abs(p.y - prev.y) > 0.5)) {
            if (!animState.has(p.id)) continue;
            animState.get(p.id).walkUntil = now + 200;
        }
    }

    // 이미지 로드 요청 (없는 플레이어)
    for (const p of currPlayers) {
        const base = getImageBase(p.characterImageUrl);
        if (base && !imageCache.has(base)) {
            loadPlayerImages(base);
        }
    }

    // 카메라 갱신 (내 캐릭터 추적)
    const me = players.find(p => p.id === myId);
    if (me) updateCamera(me.x, me.y);

    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    // ── 월드 공간 ─────────────────────────────────────────────
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-camX, -camY);

    // 배경
    if (bgImg.complete && bgImg.naturalWidth) {
        ctx.drawImage(bgImg, 0, 0, WORLD_W, WORLD_H);
    } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // 사망 플레이어 먼저 (반투명) → 생존 플레이어
    for (const p of players) {
        if (p.alive) continue;
        drawPlayerDead(p, now);
    }
    for (const p of players) {
        if (!p.alive) continue;
        drawPlayer(p, p.id === myId, now);
    }

    ctx.restore();

    // ── 스크린 공간 (HUD + 미니맵) ───────────────────────────
    if (me) {
        drawHUD(me, currPlayers);
        drawMinimap(players, me);
    }
}

// ─────────────────────────────────────────────────────────────
// 플레이어 렌더
// ─────────────────────────────────────────────────────────────
function drawPlayer(player, isMe, now) {
    const base  = getImageBase(player.characterImageUrl);
    const frame = resolveFrame(player, base, now);
    const size  = sizeCache.get(base);

    // 피격 깜빡임
    const hitAt       = hitTimeMap.get(player.id) ?? 0;
    const isInvincible = now - hitAt < INVINCIBLE_MS;
    const blink        = isInvincible && Math.floor(now / 100) % 2 === 0;

    if (!blink) {
        if (frame && size) {
            ctx.save();
            ctx.translate(player.x, player.y);
            if (player.facingRight) ctx.scale(-1, 1);
            ctx.drawImage(frame, size.charOffsetX, size.charOffsetY, size.charImgW, size.charImgH);
            ctx.restore();
        } else {
            // 이미지 로딩 전 폴백 원
            ctx.beginPath();
            ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
            ctx.fillStyle = isMe ? '#4fc3f7' : '#ef9a9a';
            ctx.fill();
        }
    }

    // 이름 태그
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = isMe ? '#ffffff' : '#ffd54f';
    const nameY = size ? player.y + size.charOffsetY - 6 : player.y - 32;
    ctx.fillText(player.name, player.x, nameY);
    ctx.restore();

    // HP 바
    drawHPBar(player, size, isMe);
}

function drawPlayerDead(player, now) {
    const base  = getImageBase(player.characterImageUrl);
    const frame = resolveFrame(player, base, now);
    const size  = sizeCache.get(base);

    ctx.save();
    ctx.globalAlpha = 0.3;
    if (frame && size) {
        ctx.translate(player.x, player.y);
        if (player.facingRight) ctx.scale(-1, 1);
        ctx.drawImage(frame, size.charOffsetX, size.charOffsetY, size.charImgW, size.charImgH);
    }
    ctx.restore();
}

function drawHPBar(player, size, isMe) {
    // 서버 판정 기준 상수 사용 → HP 바 위치가 실제 히트박스와 일치
    const hw = HIT_W;
    const hh = 5;
    const hx = player.x - hw / 2 + HIT_OFFSET_X;
    const hy = size
        ? player.y + size.charOffsetY - hh - 3
        : player.y - 26;

    const ratio = Math.max(0, player.hp / player.maxHp);
    const color = ratio > 0.5
        ? 'rgba(76,175,80,0.8)'
        : ratio > 0.25
        ? 'rgba(255,152,0,0.8)'
        : 'rgba(244,67,54,0.8)';

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = color;
    ctx.fillRect(hx, hy, hw * ratio, hh);

    if (isMe) {
        ctx.strokeStyle = 'rgba(79,195,247,0.6)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(hx - 1, hy - 1, hw + 2, hh + 2);
    }
}

// ─────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────
function drawHUD(me, allPlayers) {
    const barW = 260, barH = 20;
    const ratio = Math.max(0, me.hp / me.maxHp);
    const hpColor = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';

    // 왼쪽 패널 (내 HP + 이름)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(12, 12, barW + 8, 68);

    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(16, 18, barW, barH);
    ctx.fillStyle = hpColor;
    ctx.fillRect(16, 18, barW * ratio, barH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 18, barW, barH);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`HP  ${me.hp} / ${me.maxHp}`, 20, 33);

    ctx.fillStyle = '#ccc';
    ctx.font = '12px Arial';
    ctx.fillText(me.name, 16, 52);

    const alive = allPlayers.filter(p => p.alive).length;
    ctx.fillStyle = '#ffd54f';
    ctx.font = '11px Arial';
    ctx.fillText(`킬 ${me.kills ?? 0}  ·  생존 ${alive} / ${allPlayers.length}`, 16, 68);

    // 상단 중앙 (생존자 수)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(VIEW_W / 2 - 90, 8, 180, 32);
    ctx.fillStyle = alive <= 1 ? '#ff5722' : '#fff';
    ctx.font = 'bold 17px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${alive} / ${allPlayers.length} 생존`, VIEW_W / 2, 29);
    ctx.textAlign = 'left';
}

// ─────────────────────────────────────────────────────────────
// 미니맵
// ─────────────────────────────────────────────────────────────
function drawMinimap(players, me) {
    const MM_H   = Math.round(MM_W * WORLD_H / WORLD_W);
    const MX     = VIEW_W  - MM_W - MM_PAD;
    const MY     = VIEW_H  - MM_H - MM_PAD;
    const scaleX = MM_W / WORLD_W;
    const scaleY = MM_H / WORLD_H;

    // 배경
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(MX - 1, MY - 1, MM_W + 2, MM_H + 2);
    if (bgImg.complete && bgImg.naturalWidth) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(bgImg, MX, MY, MM_W, MM_H);
        ctx.globalAlpha = 1;
    }

    // 현재 뷰포트 영역
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        MX + camX * scaleX,
        MY + camY * scaleY,
        (VIEW_W / ZOOM) * scaleX,
        (VIEW_H / ZOOM) * scaleY,
    );

    // 플레이어 점
    for (const p of players) {
        const isMe = p.id === me.id;
        ctx.beginPath();
        ctx.arc(
            MX + p.x * scaleX,
            MY + p.y * scaleY,
            isMe ? 4 : 2.5,
            0, Math.PI * 2,
        );
        ctx.fillStyle = !p.alive ? 'rgba(100,100,100,0.5)'
            : isMe             ? '#4fc3f7'
            :                    '#ef9a9a';
        ctx.fill();
    }

    // 테두리
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(MX, MY, MM_W, MM_H);
}
