// client/renderer.js — Canvas 렌더링 (보간 + 카메라 + HUD + 미니맵)

import * as KillFeed    from './hud/killfeed.js';
import * as Leaderboard from './hud/leaderboard.js';
import * as PickupEffects from './effects/pickup-effects.js';
import * as Input        from './input.js';

import {
    WORLD_W, WORLD_H, ZOOM, CHAR_SCALE,
    HIT_W, HIT_H, HIT_OFFSET_X, HIT_OFFSET_Y,
    FRAME_MS, ACTION_STAND, ACTION_WALK, ACTION_ATTACKS,
    INVINCIBLE_MS, ATTACK_INTERVAL, ATTACK_RANGE,
    SKILL_STATS, ITEM_BLINK_MS, ACTION_SKILLS,
    RESPAWN_DELAY_MS, MAP_OBSTACLES,
    ITEM_GRADE_COLORS, ITEM_DEFAULT_GRADE,
    SAFE_ZONE_RADIUS,
} from '/shared/constants.js';

const DEBUG_HITBOX = false;
const DEBUG_ATTACK_RANGE = false;

// ── Canvas / Context ──────────────────────────────────────────
let canvas, ctx;
let VIEW_W, VIEW_H;

// ── 카메라 ────────────────────────────────────────────────────
let camX = 0, camY = 0;
let shakeUntil = 0;   // 카메라 쉐이크 종료 시간
let shakeStrength = 0;

// ── 피격 플래시 ───────────────────────────────────────────────
let hitFlashAt = 0;   // 내가 맞은 시간

// ── 리더보드 토글 ─────────────────────────────────────────────
let _showLeaderboard = true;

// ── 배경 이미지 ───────────────────────────────────────────────
const bgImg = new Image();

// ── 미니맵 상수 ───────────────────────────────────────────────
const MM_W = 200;
const MM_PAD = 12;

// ── 이미지 캐시 (imageUrlBase → { stand, walk, A13, A14, A15 }) ──
const imageCache  = new Map();
const sizeCache   = new Map();

// ── 애니메이션 상태 ──────────────────────────────────────────
const animState   = new Map();

// ── 피격 시간 (playerId → hitAt ms) ─────────────────────────
const hitTimeMap  = new Map();

// ── 이펙트 저장소 ────────────────────────────────────────────
const particlesMap   = new Map(); // playerId → particle[]
const ripplesMap     = new Map(); // playerId → ripple[]
const effectTrigger  = new Map(); // playerId → lastAttackUntil

// ── 스킬 이펙트 ──────────────────────────────────────────────
const skillEffects   = [];        // { type, level, x, y, startTime }
let legendaryUntil   = 0;
let legendaryMsg     = '';

function spawnAttackEffects(playerId, cx, cy, innerColor, outerColor, now) {
    // 파티클 12개
    const particles = particlesMap.get(playerId) || [];
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i / 12) + Math.random() * 0.5;
        const speed = 50 + Math.random() * 70;
        particles.push({
            x: cx + (Math.random() - 0.5) * 8,
            y: cy + (Math.random() - 0.5) * 8,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            startTime: now,
            duration: 350 + Math.random() * 200,
            color: Math.random() > 0.5 ? innerColor : outerColor,
        });
    }
    particlesMap.set(playerId, particles);

    // 링 확산 2개 (시차)
    const ripples = ripplesMap.get(playerId) || [];
    ripples.push({ startTime: now,       duration: 450, maxRadius: ATTACK_RANGE * 1.6, color: outerColor });
    ripples.push({ startTime: now + 80,  duration: 400, maxRadius: ATTACK_RANGE * 1.2, color: innerColor });
    ripplesMap.set(playerId, ripples);
}

// ── 색상 헬퍼 ────────────────────────────────────────────────
function getLevelColor(level) {
    if (level >= 295) return '#FFD700';
    if (level >= 290) return '#B71C1C';
    if (level >= 280) return '#E53935';
    if (level >= 270) return '#F4511E';
    if (level >= 260) return '#FB8C00';
    if (level >= 250) return '#FDD835';
    if (level >= 240) return '#C0CA33';
    if (level >= 230) return '#43A047';
    if (level >= 220) return '#00ACC1';
    if (level >= 210) return '#1E88E5';
    return '#7B1FA2';
}

function getDamageColor(damage) {
    if (damage >= 91) return '#FFD700';
    if (damage >= 81) return '#AB47BC';
    if (damage >= 71) return '#C62828';
    if (damage >= 61) return '#EF5350';
    if (damage >= 51) return '#FF7043';
    if (damage >= 41) return '#FFA726';
    if (damage >= 31) return '#FFF176';
    if (damage >= 21) return '#66BB6A';
    if (damage >= 11) return '#80DEEA';
    return '#FFFFFF';
}

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
    canvas.style.cursor = 'none';
    ctx = canvas.getContext('2d');

    window.addEventListener('keydown', e => {
        if (e.key === 'Tab') { e.preventDefault(); _showLeaderboard = !_showLeaderboard; }
    });

    // 🏆 버튼 탭/클릭 토글
    function handleToggleTap(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        const x = clientX - r.left;
        const y = clientY - r.top;
        const bx = VIEW_W - 36, by = 4, bw = 32, bh = 26;
        if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
            _showLeaderboard = !_showLeaderboard;
        }
    }
    canvas.addEventListener('click', e => handleToggleTap(e.clientX, e.clientY));
    canvas.addEventListener('touchend', e => {
        if (e.changedTouches[0]) handleToggleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: true });

    document.getElementById('loading').style.display = 'none';
}

export function getCanvas() { return canvas; }
export function getCamX()   { return camX; }
export function getCamY()   { return camY; }

// ─────────────────────────────────────────────────────────────
// 피격 알림 (game.js에서 hit 이벤트 수신 시 호출)
// ─────────────────────────────────────────────────────────────
export function notifyHit(targetId, myId) {
    const now = Date.now();
    hitTimeMap.set(targetId, now);
    if (targetId === myId) {
        hitFlashAt = now;
        shakeUntil = now + 350;
        shakeStrength = 6;
    }
}

export function notifySkillEffect({ playerId, skillType, level, x, y }) {
    skillEffects.push({ playerId, type: skillType, level, x, y, startTime: Date.now() });
}

export function notifyItemPickup({ result }) {
    PickupEffects.notify({ result }, VIEW_W, VIEW_H);
}

export function notifyLegendary(playerName, skillType) {
    legendaryUntil = Date.now() + 3000;
    legendaryMsg   = `✨ ${playerName} — 전설 ${skillType} Lv4 획득!`;
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

    const skillTypes = Object.keys(ACTION_SKILLS);
    const [stand, walk, ...rest] = await Promise.all([
        preloadFrames(base, ACTION_STAND),
        preloadFrames(base, ACTION_WALK),
        ...ACTION_ATTACKS.map(a => preloadFrames(base, a)),
        ...skillTypes.map(t => preloadFrames(base, ACTION_SKILLS[t].action, ACTION_SKILLS[t].maxFrames)),
    ]);

    const attacks = rest.slice(0, ACTION_ATTACKS.length);
    const skillFrames = {};
    skillTypes.forEach((t, i) => { skillFrames[t] = rest[ACTION_ATTACKS.length + i]; });

    imageCache.set(base, { stand, walk, attacks, skills: skillFrames });

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
        animState.set(player.id, {
            key: 'stand', frame: 0, lastFrameTime: now,
            walkUntil: 0,
            attackSeq: [], lastAttackUntil: 0,
            lastSkillUntil: 0,
        });
    }
    const anim   = animState.get(player.id);
    const frames = imageCache.get(base);

    const isSkilling  = now < player.skillUntil;
    const isAttacking = !isSkilling && now < player.attackUntil;

    // 스킬 모션: skillUntil이 새로 시작될 때 초기화
    if (isSkilling && anim.lastSkillUntil !== player.skillUntil) {
        anim.lastSkillUntil = player.skillUntil;
        anim.frame = 0;
        anim.lastFrameTime = now;
    }

    // 공격 모션: attackUntil이 새로 시작될 때 랜덤 선택
    if (isAttacking && anim.lastAttackUntil !== player.attackUntil) {
        anim.lastAttackUntil = player.attackUntil;
        anim.frame = 0;
        anim.lastFrameTime = now;
        if (frames?.attacks?.length) {
            const pick = frames.attacks[Math.floor(Math.random() * frames.attacks.length)];
            anim.attackSeq = pick ?? [];
        }
    }

    const isWalking = !isSkilling && !isAttacking && now < anim.walkUntil;

    // 우선순위: 스킬 > 공격 > 걷기 > 기본
    const nextKey = isSkilling ? 'skill' : isAttacking ? 'attack' : isWalking ? 'walk' : 'stand';

    if (nextKey !== anim.key) {
        anim.key = nextKey;
        anim.frame = 0;
        anim.lastFrameTime = now;
    }
    if (now - anim.lastFrameTime >= FRAME_MS) {
        anim.frame++;
        anim.lastFrameTime = now;
    }

    if (!frames) return null;

    if (isSkilling) {
        const type = player.skillType;
        const pool = frames.skills?.[type];
        if (pool?.length) return pool[anim.frame % pool.length];
        // 스킬 모션 없으면 공격 모션 fallback
        const seq = anim.attackSeq.length ? anim.attackSeq : (frames.attacks ?? []).flat();
        return seq.length ? seq[anim.frame % seq.length] : null;
    }
    if (isAttacking) {
        const seq = anim.attackSeq.length ? anim.attackSeq : (frames.attacks ?? []).flat();
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

    // 카메라 쉐이크
    const now = Date.now();
    if (now < shakeUntil) {
        const t = (shakeUntil - now) / 350;
        const s = shakeStrength * t;
        camX += (Math.random() * 2 - 1) * s;
        camY += (Math.random() * 2 - 1) * s;
    }
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
export function render(prevPlayers, currPlayers, t, myId, now, items = [], safeZones = [], spectateTargetId = null) {
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

    // 카메라 갱신 (관전 중이면 관전 대상, 아니면 내 캐릭터 추적)
    const me = players.find(p => p.id === myId);
    const spectateTarget = spectateTargetId ? players.find(p => p.id === spectateTargetId) : null;
    const cameraTarget = spectateTarget || me;
    if (cameraTarget) updateCamera(cameraTarget.x, cameraTarget.y);

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

    drawObstacles();

    // 안전지대
    drawSafeZones(safeZones, now);

    // 아이템
    drawItems(items, now);

    // 스킬 이펙트 (월드 공간)
    drawSkillEffects(now);

    // 방어막 글로우 (플레이어 아래 레이어)
    for (const p of players) {
        const hasShield = p.shieldUntil ? p.shieldUntil > now : p.shieldActive;
        if (p.alive && hasShield) drawShieldGlow(p, now);
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

    // ── 피격 플래시 (스크린 공간) ────────────────────────────
    const flashElapsed = now - hitFlashAt;
    if (flashElapsed < 200) {
        const alpha = 0.35 * (1 - flashElapsed / 200);
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    PickupEffects.draw(ctx, VIEW_W, VIEW_H, now);

    // ── 레전더리 메시지 ──────────────────────────────────────
    if (now < legendaryUntil) {
        const elapsed = legendaryUntil - now;
        const alpha = Math.min(1, elapsed / 500);
        const hue = (now / 8) % 360;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${hue},100%,60%)`;
        ctx.fillStyle = `hsl(${hue},100%,70%)`;
        ctx.fillText(legendaryMsg, VIEW_W / 2, VIEW_H / 2 - 40);
        ctx.restore();
    }

    // ── 스크린 공간 (HUD + 미니맵) ───────────────────────────
    if (me) {
        const hudScale = Math.min(1, VIEW_W / 560);
        drawHUD(me, currPlayers, hudScale);
        drawMinimap(players, me, items, safeZones, hudScale);
        drawSkillHUD(me, now, hudScale);
        if (_showLeaderboard) Leaderboard.draw(ctx, currPlayers, myId, VIEW_W, hudScale);

        // 관전 모드 HUD
        if (spectateTarget) {
            drawSpectateHUD(spectateTarget, currPlayers, hudScale);
        }

        // 리스폰 카운트다운
        if (!me.alive && me.respawnAt) {
            drawRespawnCountdown(me, now);
        }
    }
    KillFeed.draw(ctx, VIEW_W, VIEW_H);

    const isMoving = (animState.get(myId)?.walkUntil ?? 0) > now;
    if (me && isMoving && !spectateTarget) drawTargetCursor();
}

function drawTargetCursor() {
    const { x, y, inDeadZone, dist, deadZoneR, isTouching } = Input.getScreenPos();
    if (inDeadZone || isTouching) return;

    const fadeStart = deadZoneR;
    const fadeEnd   = deadZoneR * 4;
    const t = Math.min(1, Math.max(0, (dist - fadeStart) / (fadeEnd - fadeStart)));
    const alpha = 0.15 + t * 0.55; // 최소 0.15 ~ 최대 0.7

    const color = '#ffffff';
    const R = 10, GAP = 4, LINE = 6;

    ctx.save();
    ctx.shadowBlur = 0; // 잔상 방지
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y - R - GAP);         ctx.lineTo(x, y - R - GAP - LINE);
    ctx.moveTo(x, y + R + GAP);         ctx.lineTo(x, y + R + GAP + LINE);
    ctx.moveTo(x - R - GAP, y);         ctx.lineTo(x - R - GAP - LINE, y);
    ctx.moveTo(x + R + GAP, y);         ctx.lineTo(x + R + GAP + LINE, y);
    ctx.stroke();

    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 플레이어 렌더
// ─────────────────────────────────────────────────────────────
function drawPlayer(player, isMe, now) {
    const base  = getImageBase(player.characterImageUrl);
    const frame = resolveFrame(player, base, now);
    const size  = sizeCache.get(base);

    // ── 공격 이펙트 (이미지 뒤) ──
    {
        const cx = player.x + HIT_OFFSET_X;
        const cy = player.y + HIT_OFFSET_Y;
        const innerColor = getLevelColor(player.maxHp);
        const outerColor = getDamageColor(player.damage ?? 0);

        // 새 공격 감지 → 이펙트 스폰
        const lastAt = effectTrigger.get(player.id) ?? 0;
        if (player.attackUntil > 0 && player.attackUntil !== lastAt) {
            effectTrigger.set(player.id, player.attackUntil);
            spawnAttackEffects(player.id, cx, cy, innerColor, outerColor, now);
        }

        // C. 펄스 글로우 (attackUntil 동안)
        if (now < player.attackUntil) {
            const ATTACK_DURATION = 360;
            const t = (player.attackUntil - now) / ATTACK_DURATION;
            const pulse = Math.sin(t * Math.PI);
            const pulseR = ATTACK_RANGE * (0.55 + 0.15 * Math.sin(t * Math.PI * 3));
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR);
            grad.addColorStop(0,   innerColor + 'cc');
            grad.addColorStop(0.5, innerColor + '88');
            grad.addColorStop(1,   outerColor + '33');
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.shadowBlur = 18;
            ctx.shadowColor = innerColor;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // B. 링 확산
        const ripples = ripplesMap.get(player.id) || [];
        const activeRipples = ripples.filter(r => now - r.startTime < r.duration);
        ripplesMap.set(player.id, activeRipples);
        for (const r of activeRipples) {
            const t = (now - r.startTime) / r.duration;
            if (t < 0) continue;
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.7;
            ctx.shadowBlur = 10;
            ctx.shadowColor = r.color;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r.maxRadius * t, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // A. 파티클
        const particles = particlesMap.get(player.id) || [];
        const activeParticles = particles.filter(p => now - p.startTime < p.duration);
        particlesMap.set(player.id, activeParticles);
        for (const p of activeParticles) {
            const t = (now - p.startTime) / p.duration;
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x + p.vx * t, p.y + p.vy * t, 2.5 * (1 - t * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

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

    // 이름 태그 (HP바 위에 배치)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = isMe ? '#ffffff' : '#ffd54f';
    const nameY = size
        ? player.y + size.charOffsetY + size.charImgH * 0.35 - 4
        : player.y - 32;
    ctx.fillText(player.name, player.x, nameY);
    ctx.restore();

    // HP 바
    drawHPBar(player, size, isMe);

    // ── 공격 범위 디버그 ──
    if (DEBUG_ATTACK_RANGE) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(player.x + HIT_OFFSET_X, player.y + HIT_OFFSET_Y, ATTACK_RANGE, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // ── 히트박스 디버그 (DEBUG_HITBOX = true 시 표시) ──
    if (DEBUG_HITBOX) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            player.x - HIT_W / 2 + HIT_OFFSET_X,
            player.y - HIT_H / 2 + HIT_OFFSET_Y,
            HIT_W, HIT_H
        );
        // 히트박스 중심점
        ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
        ctx.beginPath();
        ctx.arc(player.x + HIT_OFFSET_X, player.y + HIT_OFFSET_Y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
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
        ? player.y + size.charOffsetY + size.charImgH * 0.35
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
function drawHUD(me, allPlayers, s) {
    const barW = 260, barH = 20;
    const ratio = Math.max(0, me.hp / me.maxHp);
    const hpColor = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
    const alive = allPlayers.filter(p => p.alive).length;

    // ── 왼쪽 패널 (스케일 적용) ──
    ctx.save();
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(12, 12, barW + 8, 82);

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

    ctx.fillStyle = '#ffd54f';
    ctx.font = '11px Arial';
    ctx.fillText(`킬 ${me.kills ?? 0}  ·  생존 ${alive} / ${allPlayers.length}`, 16, 66);

    ctx.fillStyle = '#80cbc4';
    ctx.font = '11px Arial';
    ctx.fillText(`전투력 ${(me.combatPower ?? 0).toLocaleString()}  ·  PvP 데미지 ${me.damage ?? 0}`, 16, 80);

    ctx.restore();

    // ── 우측 상단 (생존 수 + 쿨다운, 스케일 적용) ──
    const now2 = Date.now();
    const cdReady = now2 >= (me.nextAttackAt ?? 0);
    const remaining = Math.max(0, ((me.nextAttackAt ?? 0) - now2) / 1000);

    ctx.save();
    ctx.scale(s, s);
    ctx.textAlign = 'right';

    const rightEdge = (VIEW_W - 44) / s; // 🏆 버튼(32px) + 여백 피하기

    ctx.fillStyle = alive <= 1 ? '#ff5722' : '#e0e0e0';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(`${alive} / ${allPlayers.length} 생존`, rightEdge, 18);

    if (!cdReady) {
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 13px Arial';
        ctx.fillText(`⚔ ${remaining.toFixed(1)}s`, rightEdge, 36);
    }

    ctx.restore();

    // 🏆 토글 버튼 (스케일 미적용 — 항상 고정 크기)
    ctx.save();
    ctx.globalAlpha = _showLeaderboard ? 0.9 : 0.35;
    ctx.fillStyle = 'rgba(10,10,20,0.7)';
    ctx.beginPath();
    ctx.roundRect(VIEW_W - 36, 4, 32, 26, 5);
    ctx.fill();
    ctx.font = '15px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd54f';
    ctx.fillText('🏆', VIEW_W - 20, 22);
    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 미니맵
// ─────────────────────────────────────────────────────────────
function drawMinimap(players, me, items, zones, s) {
    const MM_H   = Math.round(MM_W * WORLD_H / WORLD_W);
    const scaleX = MM_W / WORLD_W;
    const scaleY = MM_H / WORLD_H;

    ctx.save();
    ctx.translate(VIEW_W, VIEW_H);
    ctx.scale(s, s);
    ctx.translate(-(MM_W + MM_PAD), -(MM_H + MM_PAD));

    const MX = 0, MY = 0;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(MX - 1, MY - 1, MM_W + 2, MM_H + 2);
    if (bgImg.complete && bgImg.naturalWidth) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(bgImg, MX, MY, MM_W, MM_H);
        ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(238, 205, 125, 0.78)';
    ctx.strokeStyle = 'rgba(40, 28, 14, 0.85)';
    ctx.lineWidth = 1;
    for (const ob of MAP_OBSTACLES) {
        const ox = MX + ob.x * scaleX;
        const oy = MY + ob.y * scaleY;
        const ow = Math.max(3, ob.w * scaleX);
        const oh = Math.max(3, ob.h * scaleY);
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeRect(ox, oy, ow, oh);
    }

    // 안전지대
    for (const zone of zones) {
        const zx = MX + zone.x * scaleX;
        const zy = MY + zone.y * scaleY;
        const zr = SAFE_ZONE_RADIUS * scaleX;
        ctx.beginPath();
        ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100, 255, 150, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 255, 150, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    for (const item of items) {
        const ix = MX + item.x * scaleX;
        const iy = MY + item.y * scaleY;
        ctx.beginPath();
        ctx.arc(ix, iy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#80ffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        MX + camX * scaleX,
        MY + camY * scaleY,
        (VIEW_W / ZOOM) * scaleX,
        (VIEW_H / ZOOM) * scaleY,
    );

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

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(MX, MY, MM_W, MM_H);

    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 맵 장애물 (월드 공간)
// ─────────────────────────────────────────────────────────────
function drawObstacles() {
    for (const ob of MAP_OBSTACLES) {
        ctx.save();
        ctx.fillStyle = ob.label === 'stone'
            ? 'rgba(46, 55, 63, 0.88)'
            : 'rgba(34, 41, 49, 0.84)';
        ctx.strokeStyle = 'rgba(225, 232, 240, 0.22)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.roundRect(ob.x, ob.y, ob.w, ob.h, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.clip();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#ffffff';
        const stripeW = 18;
        for (let x = ob.x - ob.h; x < ob.x + ob.w; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, ob.y + ob.h);
            ctx.lineTo(x + ob.h, ob.y);
            ctx.lineTo(x + ob.h + stripeW, ob.y);
            ctx.lineTo(x + stripeW, ob.y + ob.h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────
// 안전지대 (월드 공간)
// ─────────────────────────────────────────────────────────────
function drawSafeZones(zones, now) {
    for (const zone of zones) {
        const remaining = zone.expiresAt - now;
        const isBlinking = remaining < 3000;
        if (isBlinking && Math.floor(now / 250) % 2 === 0) continue;

        const pulse = 0.85 + 0.15 * Math.sin(now / 400);
        const r = SAFE_ZONE_RADIUS * pulse;

        ctx.save();
        // 외곽 링
        ctx.strokeStyle = 'rgba(100, 255, 150, 0.7)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -now / 50;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // 내부 영역
        const grad = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, r);
        grad.addColorStop(0, 'rgba(100, 255, 150, 0.15)');
        grad.addColorStop(0.7, 'rgba(100, 255, 150, 0.08)');
        grad.addColorStop(1, 'rgba(100, 255, 150, 0)');
        ctx.fillStyle = grad;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, r, 0, Math.PI * 2);
        ctx.fill();

        // 아이콘
        ctx.fillStyle = 'rgba(100, 255, 150, 0.9)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☮', zone.x, zone.y);
        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────
// 아이템 (월드 공간)
// ─────────────────────────────────────────────────────────────
function drawItems(items, now) {
    for (const item of items) {
        const remaining = item.expiresAt - now;
        const isBlinking = remaining < ITEM_BLINK_MS;
        if (isBlinking && Math.floor(now / 200) % 2 === 0) continue;

        const grade = item.grade || ITEM_DEFAULT_GRADE;
        const colors = ITEM_GRADE_COLORS[grade] || ITEM_GRADE_COLORS[ITEM_DEFAULT_GRADE];
        const isLegendary = grade === 'legendary';

        const pulse = 0.7 + 0.3 * Math.sin(now / 300);
        const r = isLegendary ? 14 * pulse : 10 * pulse;

        // 무지개 색상 계산 (legendary)
        const hue = (now / 10) % 360;
        const glowColor = isLegendary ? `hsl(${hue}, 100%, 60%)` : colors.glow;

        ctx.save();
        ctx.shadowBlur = isLegendary ? 30 * pulse : 20 * pulse;
        ctx.shadowColor = glowColor;
        const grad = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, r);
        grad.addColorStop(0, colors.core);
        grad.addColorStop(0.4, glowColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(item.x, item.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 등급별 심볼
        ctx.save();
        ctx.fillStyle = grade === 'risky' ? '#7b1fa2' : '#fff';
        ctx.font = `bold ${Math.round(10 * pulse)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(colors.symbol, item.x, item.y);
        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────
// 방어막 글로우 (월드 공간)
// ─────────────────────────────────────────────────────────────
function drawShieldGlow(player, now) {
    const cx = player.x + HIT_OFFSET_X;
    const cy = player.y + HIT_OFFSET_Y;
    const pulse = 0.85 + 0.15 * Math.sin(now / 150);
    const r = 36 * pulse;

    ctx.save();
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#4fc3f7';
    const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    grad.addColorStop(0, 'rgba(79,195,247,0.15)');
    grad.addColorStop(0.7, 'rgba(79,195,247,0.35)');
    grad.addColorStop(1, 'rgba(79,195,247,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(79,195,247,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 스킬 이펙트 (월드 공간)
// ─────────────────────────────────────────────────────────────
const SKILL_COLORS = {
    explosion: { inner: '#ff6b35', outer: '#ff1744' },
    shield:    { inner: '#4fc3f7', outer: '#0288d1' },
    dash:      { inner: '#b2ff59', outer: '#00e676' },
    heal:      { inner: '#69f0ae', outer: '#00c853' },
};

function drawSkillEffects(now) {
    for (let i = skillEffects.length - 1; i >= 0; i--) {
        const e = skillEffects[i];
        const elapsed = now - e.startTime;
        const duration = 600;
        if (elapsed > duration) { skillEffects.splice(i, 1); continue; }

        const t = elapsed / duration;
        const col = SKILL_COLORS[e.type] || SKILL_COLORS.explosion;

        ctx.save();
        ctx.globalAlpha = 1 - t;

        if (e.type === 'explosion') {
            const lvIdx = e.level - 1;
            const range = SKILL_STATS.explosion.range[lvIdx] ?? 120;

            // 실제 피격 범위와 동일한 고정 원 — 페이드아웃
            ctx.shadowBlur = 30;
            ctx.shadowColor = col.outer;
            ctx.strokeStyle = col.outer;
            ctx.lineWidth = 3 * (1 - t);
            ctx.beginPath();
            ctx.arc(e.x, e.y, range, 0, Math.PI * 2);
            ctx.stroke();

            // 내부 플래시 (0 → range * 0.9, 빠르게 채움)
            const innerR = range * 0.9 * Math.min(1, t * 4);
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, innerR);
            grad.addColorStop(0, col.inner + 'aa');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(e.x, e.y, innerR, 0, Math.PI * 2);
            ctx.fill();

        } else if (e.type === 'dash') {
            // 대시 트레일
            for (let j = 0; j < 6; j++) {
                const jr = (j / 6) * 40;
                ctx.shadowBlur = 15;
                ctx.shadowColor = col.inner;
                ctx.fillStyle = col.inner;
                ctx.beginPath();
                ctx.arc(e.x - jr, e.y, 6 * (1 - j / 6) * (1 - t), 0, Math.PI * 2);
                ctx.fill();
            }
            // Lv2+ 실제 AoE 범위 원 (고정 반지름, 페이드아웃)
            const dashAoeRange = SKILL_STATS.dash.aoeRange[e.level - 1] ?? 0;
            if (dashAoeRange > 0) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = col.inner;
                ctx.strokeStyle = col.inner;
                ctx.lineWidth = 2 * (1 - t);
                ctx.beginPath();
                ctx.arc(e.x, e.y, dashAoeRange, 0, Math.PI * 2);
                ctx.stroke();
            }

        } else if (e.type === 'heal') {
            // 상승 파티클
            for (let j = 0; j < 8; j++) {
                const angle = (j / 8) * Math.PI * 2;
                const r = 30 + t * 60;
                const px = e.x + Math.cos(angle) * r;
                const py = e.y + Math.sin(angle) * r - t * 40;
                ctx.shadowBlur = 10;
                ctx.shadowColor = col.inner;
                ctx.fillStyle = col.inner;
                ctx.beginPath();
                ctx.arc(px, py, 4 * (1 - t), 0, Math.PI * 2);
                ctx.fill();
            }

        } else if (e.type === 'shield') {
            // 실드 활성화 링
            const r = 36 + t * 60;
            ctx.shadowBlur = 20;
            ctx.shadowColor = col.inner;
            ctx.strokeStyle = col.inner;
            ctx.lineWidth = 3 * (1 - t);
            ctx.beginPath();
            ctx.arc(e.x + HIT_OFFSET_X, e.y + HIT_OFFSET_Y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────
// 스킬 슬롯 HUD (스크린 공간)
// ─────────────────────────────────────────────────────────────
const SKILL_ICONS = { explosion: '💣', shield: '🛡', dash: '💨', heal: '💉' };
const SKILL_SLOT_KEYS = ['Q', 'E', 'R'];
const SLOT_SIZE = 48;
const SLOT_GAP  = 8;

function drawSkillHUD(me, now, s) {
    if (!me.skills) return;
    const totalW = (SLOT_SIZE * 3 + SLOT_GAP * 2) * s;
    const startX = (VIEW_W - totalW) / 2;
    const startY = VIEW_H - (SLOT_SIZE + 16) * s;

    // 터치 영역 등록 (스크린 좌표)
    const touchAreas = [];
    for (let i = 0; i < 3; i++) {
        touchAreas.push({
            x: startX + i * (SLOT_SIZE + SLOT_GAP) * s,
            y: startY,
            w: SLOT_SIZE * s,
            h: SLOT_SIZE * s,
        });
    }
    Input.registerSkillAreas(touchAreas);

    ctx.save();
    ctx.scale(s, s);
    const sx0 = startX / s;
    const sy0 = startY / s;

    for (let i = 0; i < 3; i++) {
        const slot = me.skills[i];
        const bx = sx0 + i * (SLOT_SIZE + SLOT_GAP);
        const by = sy0;

        // 슬롯 배경
        ctx.fillStyle = slot ? 'rgba(10,10,30,0.85)' : 'rgba(10,10,30,0.45)';
        ctx.strokeStyle = slot ? '#666' : '#333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, SLOT_SIZE, SLOT_SIZE, 6);
        ctx.fill();
        ctx.stroke();

        if (!slot) {
            // 빈 슬롯
            ctx.fillStyle = '#444';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(SKILL_SLOT_KEYS[i], bx + SLOT_SIZE / 2, by + SLOT_SIZE / 2 + 4);
            continue;
        }

        // 쿨다운 오버레이
        const cdRemain = Math.max(0, slot.cooldownUntil - now);
        const totalCd = SKILL_STATS[slot.type].cooldown[slot.level - 1];
        const cdRatio = cdRemain / totalCd;

        // 스킬 아이콘
        ctx.font = `${SLOT_SIZE * 0.5}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = cdRatio > 0 ? 0.4 : 1;
        ctx.fillText(SKILL_ICONS[slot.type] ?? '?', bx + SLOT_SIZE / 2, by + SLOT_SIZE / 2 - 4);
        ctx.globalAlpha = 1;

        // 쿨다운 어두운 오버레이 (시계 방향)
        if (cdRatio > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(bx + SLOT_SIZE / 2, by + SLOT_SIZE / 2);
            ctx.arc(bx + SLOT_SIZE / 2, by + SLOT_SIZE / 2, SLOT_SIZE, -Math.PI / 2, -Math.PI / 2 + cdRatio * Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fill();
            ctx.restore();

            // 쿨다운 숫자
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((cdRemain / 1000).toFixed(1), bx + SLOT_SIZE / 2, by + SLOT_SIZE / 2 + 6);
        }

        // 레벨 표시
        const lvColor = slot.level === 4 ? '#ffd700' : slot.level === 3 ? '#ce93d8' : slot.level === 2 ? '#80cbc4' : '#aaa';
        ctx.fillStyle = lvColor;
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`Lv${slot.level}`, bx + 3, by + SLOT_SIZE - 3);

        // 단축키
        ctx.fillStyle = '#888';
        ctx.font = '9px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(SKILL_SLOT_KEYS[i], bx + SLOT_SIZE - 3, by + SLOT_SIZE - 3);

        // Lv4 레인보우 테두리
        if (slot.level === 4) {
            const hue = (now / 6) % 360;
            ctx.strokeStyle = `hsl(${hue},100%,60%)`;
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 12;
            ctx.shadowColor = `hsl(${hue},100%,60%)`;
            ctx.beginPath();
            ctx.roundRect(bx, by, SLOT_SIZE, SLOT_SIZE, 6);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 관전 모드 HUD
// ─────────────────────────────────────────────────────────────
function drawSpectateHUD(target, allPlayers, s) {
    const alive = allPlayers.filter(p => p.alive);
    const idx = alive.findIndex(p => p.id === target.id);
    const total = alive.length;

    ctx.save();

    // 상단 중앙 — 관전 중 표시
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(VIEW_W / 2 - 120, 8, 240, 36, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`👁 관전 중: ${target.name}`, VIEW_W / 2, 26);

    // 좌우 화살표 + 순서
    ctx.fillStyle = '#aaa';
    ctx.font = '18px Arial';
    ctx.fillText('◀', VIEW_W / 2 - 100, 26);
    ctx.fillText('▶', VIEW_W / 2 + 100, 26);

    ctx.font = '11px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText(`${idx + 1} / ${total}`, VIEW_W / 2, 40);

    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// 리스폰 카운트다운
// ─────────────────────────────────────────────────────────────
function drawRespawnCountdown(me, now) {
    if (me.alive || !me.respawnAt) return;

    const remaining = Math.max(0, me.respawnAt - now);
    const sec = (remaining / 1000).toFixed(1);

    // 어두운 오버레이
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 카운트다운 표시
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff4444';
    ctx.fillText(sec, VIEW_W / 2, VIEW_H / 2 - 20);

    ctx.font = '18px Arial';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ccc';
    ctx.fillText('부활까지...', VIEW_W / 2, VIEW_H / 2 + 30);

    ctx.restore();
}
