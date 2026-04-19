import {
    CHAR_SPEED, STOP_DIST, WORLD_W, WORLD_H,
    HIT_W, HIT_H, HIT_OFFSET_X, HIT_OFFSET_Y,
    ATTACK_RANGE, INVINCIBLE_MS,
} from './constants.js';

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
    player.x += (dx / dist) * move;
    player.y += (dy / dist) * move;

    // 맵 경계 클램프
    player.x = Math.max(0, Math.min(player.x, WORLD_W));
    player.y = Math.max(0, Math.min(player.y, WORLD_H));

    return {
        moved: true,
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
