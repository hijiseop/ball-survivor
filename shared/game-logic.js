import {
    CHAR_SPEED, STOP_DIST, WORLD_W, WORLD_H,
    HIT_W, HIT_H, HIT_OFFSET_X, HIT_OFFSET_Y,
    ATTACK_RANGE, INVINCIBLE_MS,
    SKILL_STATS, MAP_OBSTACLES,
} from './constants.js';

function clampPosition(player) {
    player.x = Math.max(0, Math.min(player.x, WORLD_W));
    player.y = Math.max(0, Math.min(player.y, WORLD_H));
}

function playerBoundsAt(x, y) {
    const cx = x + HIT_OFFSET_X;
    const cy = y + HIT_OFFSET_Y;
    return {
        x: cx - HIT_W / 2,
        y: cy - HIT_H / 2,
        w: HIT_W,
        h: HIT_H,
    };
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
}

export function isBlockedPosition(x, y, obstacles = MAP_OBSTACLES) {
    const bounds = playerBoundsAt(x, y);
    return obstacles.some(ob => rectsOverlap(bounds, ob));
}

export function randomOpenPosition(margin = 50) {
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * (WORLD_W - margin * 2) + margin;
        const y = Math.random() * (WORLD_H - margin * 2) + margin;
        if (!isBlockedPosition(x, y)) return { x, y };
    }
    return { x: margin, y: margin };
}

function moveWithObstacleSlide(player, moveX, moveY) {
    const segments = Math.max(1, Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveY)) / (HIT_W / 2)));
    const stepX = moveX / segments;
    const stepY = moveY / segments;
    let moved = false;

    for (let i = 0; i < segments; i++) {
        if (!moveOneStepWithObstacleSlide(player, stepX, stepY)) break;
        moved = true;
    }

    return moved;
}

function moveOneStepWithObstacleSlide(player, moveX, moveY) {
    const startX = player.x;
    const startY = player.y;
    let movedX = false;
    let movedY = false;

    player.x = startX + moveX;
    clampPosition(player);
    if (isBlockedPosition(player.x, startY)) {
        player.x = startX;
    } else {
        movedX = Math.abs(player.x - startX) > 0.001;
    }

    player.y = startY + moveY;
    clampPosition(player);
    if (isBlockedPosition(player.x, player.y)) {
        player.y = startY;
    } else {
        movedY = Math.abs(player.y - startY) > 0.001;
    }

    return movedX || movedY;
}

/**
 * 플레이어 위치 업데이트
 * @param {{ x: number, y: number, targetX: number, targetY: number }} player
 * @param {number} dt - 초 단위 델타타임
 * @returns {{ moved: boolean, facingRight?: boolean }}
 */
export function updatePosition(player, dt) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= STOP_DIST) return { moved: false };

    const step = CHAR_SPEED * dt;
    const move = Math.min(step, dist);
    const moved = moveWithObstacleSlide(player, (dx / dist) * move, (dy / dist) * move);

    return {
        moved,
        facingRight: dx > 5 ? true : dx < -5 ? false : undefined,
    };
}

/**
 * 공격 히트 판정 (공격자 히트박스 중심 ↔ 대상 히트박스 중심 거리)
 * @param {{ x: number, y: number }} attacker
 * @param {{ x: number, y: number }} target
 * @returns {boolean}
 */
export function checkAttackHit(attacker, target) {
    // 공격자 공격 원 중심
    const ax = attacker.x + HIT_OFFSET_X;
    const ay = attacker.y + HIT_OFFSET_Y;

    // 타겟 히트박스 사각형
    const tx = target.x + HIT_OFFSET_X;
    const ty = target.y + HIT_OFFSET_Y;

    // 원 중심에서 사각형 위의 가장 가까운 점 계산
    const clampedX = Math.max(tx - HIT_W / 2, Math.min(ax, tx + HIT_W / 2));
    const clampedY = Math.max(ty - HIT_H / 2, Math.min(ay, ty + HIT_H / 2));

    const dx = ax - clampedX;
    const dy = ay - clampedY;
    return dx * dx + dy * dy < ATTACK_RANGE * ATTACK_RANGE;
}

/**
 * 데미지 적용 (무적 시간 체크 포함)
 * @param {{ hp: number, invincibleUntil: number }} target
 * @param {number} damage
 * @param {number} now - Date.now()
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

// ── 스킬 효과 ────────────────────────────────────────────────────

export function levelModifier(attackerLevel, targetLevel) {
    const diff = attackerLevel - targetLevel;
    return diff >= 5 ? 1.2 : diff >= 0 ? 1 + diff * 0.04 : Math.max(0.6, 1 + diff * 0.01);
}

/**
 * 폭발: 주변 AoE 데미지 (타겟별 레벨 보정 적용)
 * @returns {{ hits: Array<{target, damage}> }}
 */
export function applyExplosion(attacker, allPlayers, level, now) {
    const idx = level - 1;
    const stat = SKILL_STATS.explosion;
    const range = stat.range[idx];
    const mult  = stat.dmgMult[idx];

    const hits = [];
    const reflects = [];
    for (const target of allPlayers) {
        if (target.id === attacker.id || !target.alive) continue;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        if (dx * dx + dy * dy > range * range) continue;

        const baseDmg = Math.max(1, Math.round(attacker.damage * mult * levelModifier(attacker.level, target.level)));

        // 방어막 중이면 데미지 대신 반사
        if (target.shieldUntil && now < target.shieldUntil) {
            reflects.push({ target, damage: Math.max(1, Math.round(baseDmg * target.shieldReflect)) });
            continue;
        }

        const result = applyDamage(target, baseDmg, now);
        if (result.applied) hits.push({ target, damage: baseDmg, died: result.died });
    }
    return { hits, reflects };
}

/**
 * 방어막: 일정 시간 무적 + 반사
 */
export function applyShield(player, level, now) {
    const idx = level - 1;
    const stat = SKILL_STATS.shield;
    player.shieldUntil  = now + stat.duration[idx];
    player.shieldReflect = stat.reflect[idx];
}

/**
 * 대시: 마우스 방향으로 순간이동
 * @returns {{ aoeRange, dmgMult }} — Lv2+ AoE 정보 (호출자에서 데미지 처리)
 */
export function applyDash(player, level) {
    const idx = level - 1;
    const stat = SKILL_STATS.dash;
    const dist = stat.distance[idx];

    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 1) {
        const stepX = (dx / len) * dist;
        const stepY = (dy / len) * dist;
        moveWithObstacleSlide(player, stepX, stepY);
    } else {
        const dir = player.facingRight ? 1 : -1;
        moveWithObstacleSlide(player, dir * dist, 0);
    }
    player.targetX = player.x;
    player.targetY = player.y;

    return { aoeRange: stat.aoeRange[idx], dmgMult: stat.dmgMult[idx] };
}

/**
 * 회복: HP 회복
 */
export function applyHeal(player, level) {
    const idx = level - 1;
    const amount = Math.round(player.maxHp * SKILL_STATS.heal.hpPercent[idx]);
    player.hp = Math.min(player.maxHp, player.hp + amount);
    return amount;
}
