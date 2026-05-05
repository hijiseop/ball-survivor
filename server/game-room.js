import { updatePosition, checkAttackHit, applyDamage, applyExplosion, applyShield, applyDash, applyHeal, levelModifier, randomOpenPosition } from '../shared/game-logic.js';
import { rollItemGrade, rollItemReward } from '../shared/item-system.js';
import {
    SERVER_TICK_MS, SERVER_TICK_RATE,
    ATTACK_INTERVAL, ATTACK_DURATION,
    GRID_CELL_SIZE, MAX_PLAYERS,
    SKILL_TYPES, SKILL_STATS,
    MAX_ITEMS, ITEM_SPAWN_INTERVAL, ITEM_EXPIRE_MS, ITEM_PICKUP_RANGE,
    SKILL_MOTION_MS,
    SAFE_ZONE_RADIUS, SAFE_ZONE_DURATION_MIN, SAFE_ZONE_DURATION_MAX,
    SAFE_ZONE_SPAWN_INTERVAL, MAX_SAFE_ZONES, SAFE_ZONE_CORNERS,
} from '../shared/constants.js';
import { Player } from './player.js';

let _itemIdCounter = 0;
let _safeZoneIdCounter = 0;

// 디버그 플래그 — .env 또는 실행 환경에서 설정 (shared/에 두지 않음)
const DEBUG_ITEM_LEVEL   = process.env.DEBUG_ITEM_LEVEL   ? parseInt(process.env.DEBUG_ITEM_LEVEL)        : null;
const DEBUG_START_SKILLS = process.env.DEBUG_START_SKILLS === 'true';
const ITEM_PICKUP_RETRY_MS = 800;

export class GameRoom {
    constructor(io) {
        this.io = io;
        this.players = new Map(); // socketId → Player
        this.items    = [];       // { id, x, y, spawnedAt, expiresAt }
        this.safeZones = [];      // { id, x, y, expiresAt }
        this.tickCount = 0;
        this._interval = null;
        this._lastItemSpawn = 0;
        this._lastSafeZoneSpawn = 0;
    }

    start() {
        this._interval = setInterval(() => this._tick(), SERVER_TICK_MS);
        console.log(`GameRoom started @ ${SERVER_TICK_RATE}Hz`);
    }

    stop() {
        clearInterval(this._interval);
    }

    // 새 플레이어 입장
    join(socket, { characterName, characterLevel, combatPower, combatPowerRaw, bossDmg, critDmg, characterImageUrl }) {
        if (this.players.size >= MAX_PLAYERS) {
            socket.emit('roomFull');
            socket.disconnect(true);
            console.log(`! roomFull: ${characterName} rejected (${this.players.size}/${MAX_PLAYERS})`);
            return null;
        }

        const player = new Player(
            socket.id,
            characterName,
            characterLevel,
            combatPower,
            characterImageUrl,
            combatPowerRaw,
            bossDmg,
            critDmg
        );
        // 디버그: 입장 시 슬롯 3개 Lv1 자동 장착
        if (DEBUG_START_SKILLS) {
            SKILL_TYPES.slice(0, 3).forEach((type, i) => {
                player.skills[i] = { type, level: 1, cooldownUntil: 0 };
            });
        }

        this.players.set(socket.id, player);

        // 나머지 플레이어들에게 입장 알림
        socket.broadcast.emit('playerJoin', { id: socket.id, name: characterName });

        console.log(`+ join: ${characterName} (${socket.id}) | total: ${this.players.size}`);
        return player;
    }

    // 플레이어 퇴장
    leave(id) {
        if (!this.players.has(id)) return;
        const player = this.players.get(id);
        this.players.delete(id);
        this.io.emit('playerLeave', { id });
        console.log(`- leave: ${player.name} (${id}) | total: ${this.players.size}`);
    }

    // ── 이벤트 헬퍼 ──────────────────────────────────────────────
    _emitHit(attacker, target, damage) {
        this.io.emit('hit', { attackerId: attacker.id, targetId: target.id, damage, targetHp: target.hp });
    }

    _emitKill(killer, victim, now) {
        // 킬 드롭: 피해자 스킬 레벨 총합 기준
        this._dropItemOnKill(victim, now);
        victim.die(now);
        killer.kills++;
        this.io.emit('kill', { killerId: killer.id, killerName: killer.name, victimId: victim.id, victimName: victim.name });
    }

    _dropItemOnKill(victim, now) {
        const totalLv = victim.skills.reduce((sum, s) => sum + (s?.level ?? 0), 0);
        if (totalLv === 0) return;

        let grade;
        if (totalLv >= 10) grade = 'legendary';
        else if (totalLv >= 7) grade = 'risky';
        else if (totalLv >= 4) grade = 'rare';
        else grade = 'normal';

        const id = ++_itemIdCounter;
        const item = {
            id,
            x: victim.x,
            y: victim.y,
            grade,
            spawnedAt: now,
            expiresAt: now + ITEM_EXPIRE_MS,
        };
        this.items.push(item);
        this.io.emit('itemSpawn', { id: item.id, x: item.x, y: item.y, grade: item.grade, expiresAt: item.expiresAt });
    }

    // 클라이언트 입력 반영
    setInput(id, targetX, targetY) {
        const player = this.players.get(id);
        if (!player || !player.alive) return;
        player.targetX = targetX;
        player.targetY = targetY;
    }

    // 스킬 발동
    useSkill(id, slotIndex) {
        const player = this.players.get(id);
        if (!player || !player.alive) return;
        const slot = player.skills[slotIndex];
        if (!slot) return;

        const now = Date.now();
        if (now < slot.cooldownUntil) return;

        const lvIdx = slot.level - 1;
        slot.cooldownUntil  = now + SKILL_STATS[slot.type].cooldown[lvIdx];
        player.skillUntil   = now + SKILL_MOTION_MS;
        player.skillType    = slot.type;

        // 안전지대 내에서는 공격 스킬 무효
        const inSafeZone = this._isInSafeZone(player);
        const allPlayers = [...this.players.values()];

        switch (slot.type) {
            case 'explosion': {
                if (!inSafeZone) {
                    const targets = allPlayers.filter(p => !this._isInSafeZone(p));
                    const { hits, reflects } = applyExplosion(player, targets, slot.level, now);
                    for (const h of hits) {
                        this._emitHit(player, h.target, h.damage);
                        if (h.died) this._emitKill(player, h.target, now);
                    }
                    for (const r of reflects) {
                        const rr = applyDamage(player, r.damage, now);
                        if (rr.applied) {
                            this._emitHit(r.target, player, r.damage);
                            if (rr.died) this._emitKill(r.target, player, now);
                        }
                    }
                }
                this.io.emit('skillEffect', { playerId: player.id, skillType: 'explosion', level: slot.level, x: player.x, y: player.y });
                break;
            }
            case 'shield': {
                applyShield(player, slot.level, now);
                this.io.emit('skillEffect', { playerId: player.id, skillType: 'shield', level: slot.level, x: player.x, y: player.y });
                break;
            }
            case 'dash': {
                const { aoeRange, dmgMult } = applyDash(player, slot.level);
                this.io.emit('skillEffect', { playerId: player.id, skillType: 'dash', level: slot.level, x: player.x, y: player.y });
                // Lv2+ 도착지 AoE (안전지대 내 무효)
                if (aoeRange > 0 && !this._isInSafeZone(player)) {
                    for (const target of allPlayers) {
                        if (target.id === player.id || !target.alive) continue;
                        if (this._isInSafeZone(target)) continue;
                        const dx = target.x - player.x;
                        const dy = target.y - player.y;
                        if (dx * dx + dy * dy > aoeRange * aoeRange) continue;
                        const dmg = Math.max(1, Math.round(player.damage * dmgMult * levelModifier(player.level, target.level)));
                        if (now < target.shieldUntil) {
                            const reflectDmg = Math.max(1, Math.round(dmg * target.shieldReflect));
                            const rr = applyDamage(player, reflectDmg, now);
                            if (rr.applied) {
                                this._emitHit(target, player, reflectDmg);
                                if (rr.died) this._emitKill(target, player, now);
                            }
                            continue;
                        }
                        const r = applyDamage(target, dmg, now);
                        if (r.applied) {
                            this._emitHit(player, target, dmg);
                            if (r.died) this._emitKill(player, target, now);
                        }
                    }
                }
                break;
            }
            case 'heal': {
                const amount = applyHeal(player, slot.level);
                this.io.emit('skillEffect', { playerId: player.id, skillType: 'heal', level: slot.level, x: player.x, y: player.y, amount });
                break;
            }
        }
    }

    // ── 아이템 스폰 ──────────────────────────────────────────────
    _spawnItem(now) {
        if (this.items.length >= MAX_ITEMS) return;
        const id = ++_itemIdCounter;
        const spawn = randomOpenPosition();
        const item = {
            id,
            x: spawn.x,
            y: spawn.y,
            grade: rollItemGrade(),
            spawnedAt: now,
            expiresAt: now + ITEM_EXPIRE_MS,
        };
        this.items.push(item);
        this.io.emit('itemSpawn', { id: item.id, x: item.x, y: item.y, grade: item.grade, expiresAt: item.expiresAt });
    }

    // ── 아이템 획득 결과 결정 ────────────────────────────────────
    _rollItem(player, item) {
        return rollItemReward(player, item.grade, { debugLevel: DEBUG_ITEM_LEVEL });
    }

    // ── 아이템 획득 처리 ─────────────────────────────────────────
    _pickupItem(player, item) {
        const result = this._rollItem(player, item);

        if (result.curse) {
            // 저주: 보유 스킬 중 랜덤 대상
            const owned = player.skills.map((s, i) => s ? i : -1).filter(i => i >= 0);
            if (owned.length === 0) {
                this.io.to(player.id).emit('itemPickup', { itemId: item.id, consumed: true, result: { curse: true, grade: item.grade, effect: 'none' } });
                return { consumed: true };
            }
            const targetIdx = owned[Math.floor(Math.random() * owned.length)];
            const roll = Math.random();
            let effect, slotInfo;
            if (roll < 0.10) {
                // 10% 소멸
                effect = 'destroy';
                slotInfo = { slotIndex: targetIdx, type: player.skills[targetIdx].type };
                player.skills[targetIdx] = null;
            } else {
                // 90% Lv-1
                effect = 'downgrade';
                slotInfo = { slotIndex: targetIdx, type: player.skills[targetIdx].type };
                if (player.skills[targetIdx].level <= 1) {
                    player.skills[targetIdx] = null;
                } else {
                    player.skills[targetIdx].level--;
                }
            }
            this.io.to(player.id).emit('itemPickup', { itemId: item.id, consumed: true, result: { curse: true, grade: item.grade, effect, ...slotInfo } });
            return { consumed: true };
        }

        const { level, type } = result;

        // 같은 타입 슬롯 찾기
        const sameIdx = player.skills.findIndex(s => s && s.type === type);
        if (sameIdx >= 0) {
            if (level > player.skills[sameIdx].level) {
                player.skills[sameIdx].level = level;
                this._emitPickup(player, item.id, level, type, sameIdx, item.grade);
            } else {
                // 업그레이드 안 됨 — 조용히 소비
                this.io.to(player.id).emit('itemPickup', { itemId: item.id, consumed: true, result: { noEffect: true } });
            }
            return { consumed: true };
        }

        // 빈 슬롯 찾기
        const emptyIdx = player.skills.findIndex(s => s === null);
        if (emptyIdx >= 0) {
            player.skills[emptyIdx] = { type, level, cooldownUntil: 0 };
            this._emitPickup(player, item.id, level, type, emptyIdx, item.grade);
            return { consumed: true };
        }

        // 꽉 참 → Lv4 제외 랜덤 교체
        const candidates = player.skills.map((s, i) => (s && s.level < 4) ? i : -1).filter(i => i >= 0);
        if (candidates.length === 0) {
            // 모든 슬롯 Lv4면 그냥 소비 (상대에게 안 줌)
            this.io.to(player.id).emit('itemPickup', { itemId: item.id, consumed: true, result: { level, type, grade: item.grade, noEffect: true } });
            return { consumed: true };
        }
        const replaceIdx = candidates[Math.floor(Math.random() * candidates.length)];
        player.skills[replaceIdx] = { type, level, cooldownUntil: 0 };
        this._emitPickup(player, item.id, level, type, replaceIdx, item.grade);
        return { consumed: true };
    }

    _emitPickup(player, itemId, level, type, slotIndex, grade = undefined) {
        const isLegendary = level === 4;
        this.io.to(player.id).emit('itemPickup', {
            itemId,
            consumed: true,
            result: { level, type, slotIndex, grade, legendary: isLegendary },
        });
        if (isLegendary) {
            this.io.emit('legendaryDrop', { playerId: player.id, playerName: player.name, skillType: type });
        }
    }

    // 그리드 빌드: 살아있는 플레이어를 셀별로 분류
    _buildGrid() {
        const grid = new Map();
        for (const player of this.players.values()) {
            if (!player.alive) continue;
            const key = `${Math.floor(player.x / GRID_CELL_SIZE)},${Math.floor(player.y / GRID_CELL_SIZE)}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(player);
        }
        return grid;
    }

    // 해당 플레이어 주변 3×3 셀의 플레이어 목록 반환
    _getNeighbors(grid, player) {
        const cx = Math.floor(player.x / GRID_CELL_SIZE);
        const cy = Math.floor(player.y / GRID_CELL_SIZE);
        const result = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cell = grid.get(`${cx + dx},${cy + dy}`);
                if (cell) result.push(...cell);
            }
        }
        return result;
    }

    // 20Hz 틱 루프
    _tick() {
        const now = Date.now();
        const dt = SERVER_TICK_MS / 1000;
        this.tickCount++;

        // 아이템 스폰
        if (now - this._lastItemSpawn >= ITEM_SPAWN_INTERVAL) {
            this._lastItemSpawn = now;
            this._spawnItem(now);
        }

        // 아이템 만료
        const expired = this.items.filter(it => now >= it.expiresAt);
        for (const it of expired) this.io.emit('itemExpire', { itemId: it.id });
        this.items = this.items.filter(it => now < it.expiresAt);

        // 안전지대 스폰
        if (now - this._lastSafeZoneSpawn >= SAFE_ZONE_SPAWN_INTERVAL) {
            this._lastSafeZoneSpawn = now;
            this._spawnSafeZone(now);
        }

        // 안전지대 만료
        const expiredZones = this.safeZones.filter(z => now >= z.expiresAt);
        for (const z of expiredZones) this.io.emit('safeZoneExpire', { zoneId: z.id });
        this.safeZones = this.safeZones.filter(z => now < z.expiresAt);

        // 리스폰 처리
        for (const player of this.players.values()) {
            if (!player.alive && player.respawnAt > 0 && now >= player.respawnAt) {
                player.respawn(now);
                this.io.emit('respawn', { playerId: player.id, x: player.x, y: player.y });
            }
        }

        // 아이템 픽업 감지
        for (const player of this.players.values()) {
            if (!player.alive) continue;
            for (let i = this.items.length - 1; i >= 0; i--) {
                const item = this.items[i];
                if (item.pickupBlockedUntil?.get(player.id) > now) continue;
                const dx = player.x - item.x;
                const dy = player.y - item.y;
                if (dx * dx + dy * dy <= ITEM_PICKUP_RANGE * ITEM_PICKUP_RANGE) {
                    const { consumed } = this._pickupItem(player, item);
                    if (consumed) {
                        this.items.splice(i, 1);
                    } else {
                        item.pickupBlockedUntil ??= new Map();
                        item.pickupBlockedUntil.set(player.id, now + ITEM_PICKUP_RETRY_MS);
                    }
                    break;
                }
            }
        }

        // 이동 처리
        for (const player of this.players.values()) {
            if (!player.alive) continue;
            const { facingRight } = updatePosition(player, dt);
            if (facingRight !== undefined) player.facingRight = facingRight;
        }

        // 공격 판정: 그리드로 근접 후보만 체크
        const grid = this._buildGrid();

        for (const player of this.players.values()) {
            if (!player.alive || now < player.nextAttackAt) continue;

            player.nextAttackAt = now + ATTACK_INTERVAL;
            player.attackUntil = now + ATTACK_DURATION;

            for (const target of this._getNeighbors(grid, player)) {
                if (target.id === player.id || !target.alive) continue;
                // 안전지대 내 공격 불가
                if (this._isInSafeZone(player) || this._isInSafeZone(target)) continue;

                if (checkAttackHit(player, target)) {
                    const finalDamage = Math.max(1, Math.round(player.damage * levelModifier(player.level, target.level)));

                    // 방어막 반사
                    if (now < target.shieldUntil) {
                        const reflectDmg = Math.max(1, Math.round(finalDamage * target.shieldReflect));
                        const rr = applyDamage(player, reflectDmg, now);
                        if (rr.applied) {
                            this._emitHit(target, player, reflectDmg);
                            if (rr.died) this._emitKill(target, player, now);
                        }
                        continue;
                    }

                    const result = applyDamage(target, finalDamage, now);
                    if (result.applied) {
                        this._emitHit(player, target, finalDamage);
                        if (result.died) this._emitKill(player, target, now);
                    }
                }
            }
        }

        // 상태 브로드캐스트 — 본인은 풀 스냅샷, 상대는 peer 스냅샷
        const fullMap  = new Map([...this.players.values()].map(p => [p.id, p.toSnapshot()]));
        const peerList = [...this.players.values()].map(p => p.toPeerSnapshot());
        const itemsData = this.items.map(it => ({ id: it.id, x: it.x, y: it.y, grade: it.grade, expiresAt: it.expiresAt }));
        const zonesData = this.safeZones.map(z => ({ id: z.id, x: z.x, y: z.y, expiresAt: z.expiresAt }));

        for (const pid of this.players.keys()) {
            const myFull = fullMap.get(pid);
            const others = peerList.filter(s => s.id !== pid);
            this.io.to(pid).emit('state', {
                tick: this.tickCount,
                players: [myFull, ...others],
                items: itemsData,
                safeZones: zonesData,
            });
        }
    }

    // ── 안전지대 ─────────────────────────────────────────────────
    _spawnSafeZone(now) {
        if (this.safeZones.length >= MAX_SAFE_ZONES) return;
        const id = ++_safeZoneIdCounter;
        const corner = SAFE_ZONE_CORNERS[Math.floor(Math.random() * SAFE_ZONE_CORNERS.length)];
        const duration = SAFE_ZONE_DURATION_MIN + Math.random() * (SAFE_ZONE_DURATION_MAX - SAFE_ZONE_DURATION_MIN);
        const zone = {
            id,
            x: corner.x,
            y: corner.y,
            expiresAt: now + duration,
        };
        this.safeZones.push(zone);
        this.io.emit('safeZoneSpawn', { id: zone.id, x: zone.x, y: zone.y, expiresAt: zone.expiresAt });
    }

    _isInSafeZone(player) {
        for (const z of this.safeZones) {
            const dx = player.x - z.x;
            const dy = player.y - z.y;
            if (dx * dx + dy * dy <= SAFE_ZONE_RADIUS * SAFE_ZONE_RADIUS) return true;
        }
        return false;
    }
}
