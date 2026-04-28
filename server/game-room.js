import { updatePosition, checkAttackHit, applyDamage, applyExplosion, applyShield, applyDash, applyHeal, levelModifier } from '../shared/game-logic.js';
import {
    SERVER_TICK_MS, SERVER_TICK_RATE,
    ATTACK_INTERVAL, ATTACK_DURATION,
    GRID_CELL_SIZE, MAX_PLAYERS,
    SKILL_TYPES, SKILL_STATS,
    MAX_ITEMS, ITEM_SPAWN_INTERVAL, ITEM_EXPIRE_MS, ITEM_PICKUP_RANGE,
    ITEM_PROB_LV1, ITEM_PROB_LV2, ITEM_PROB_LV3, ITEM_PROB_LV4,
    WORLD_W, WORLD_H, SKILL_MOTION_MS,
} from '../shared/constants.js';
import { Player } from './player.js';

let _itemIdCounter = 0;

// 디버그 플래그 — .env 또는 실행 환경에서 설정 (shared/에 두지 않음)
const DEBUG_ITEM_LEVEL   = process.env.DEBUG_ITEM_LEVEL   ? parseInt(process.env.DEBUG_ITEM_LEVEL)        : null;
const DEBUG_START_SKILLS = process.env.DEBUG_START_SKILLS === 'true';

export class GameRoom {
    constructor(io) {
        this.io = io;
        this.players = new Map(); // socketId → Player
        this.items    = [];       // { id, x, y, spawnedAt, expiresAt }
        this.tickCount = 0;
        this._interval = null;
        this._lastItemSpawn = 0;
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

        const allPlayers = [...this.players.values()];

        switch (slot.type) {
            case 'explosion': {
                const { hits, reflects } = applyExplosion(player, allPlayers, slot.level, now);
                for (const h of hits) {
                    this.io.emit('hit', { attackerId: player.id, targetId: h.target.id, damage: h.damage, targetHp: h.target.hp });
                    if (h.died) { h.target.alive = false; player.kills++; this.io.emit('kill', { killerId: player.id, killerName: player.name, victimId: h.target.id, victimName: h.target.name }); }
                }
                for (const r of reflects) {
                    const rr = applyDamage(player, r.damage, now);
                    if (rr.applied) {
                        this.io.emit('hit', { attackerId: r.target.id, targetId: player.id, damage: r.damage, targetHp: player.hp });
                        if (rr.died) { player.alive = false; r.target.kills++; this.io.emit('kill', { killerId: r.target.id, killerName: r.target.name, victimId: player.id, victimName: player.name }); }
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
                // Lv2+ 도착지 AoE
                if (aoeRange > 0) {
                    for (const target of allPlayers) {
                        if (target.id === player.id || !target.alive) continue;
                        const dx = target.x - player.x;
                        const dy = target.y - player.y;
                        if (dx * dx + dy * dy > aoeRange * aoeRange) continue;
                        const dmg = Math.max(1, Math.round(player.damage * dmgMult * levelModifier(player.level, target.level)));
                        if (now < target.shieldUntil) {
                            const reflectDmg = Math.max(1, Math.round(dmg * target.shieldReflect));
                            const rr = applyDamage(player, reflectDmg, now);
                            if (rr.applied) {
                                this.io.emit('hit', { attackerId: target.id, targetId: player.id, damage: reflectDmg, targetHp: player.hp });
                                if (rr.died) { player.alive = false; target.kills++; this.io.emit('kill', { killerId: target.id, killerName: target.name, victimId: player.id, victimName: player.name }); }
                            }
                            continue;
                        }
                        const r = applyDamage(target, dmg, now);
                        if (r.applied) {
                            this.io.emit('hit', { attackerId: player.id, targetId: target.id, damage: dmg, targetHp: target.hp });
                            if (r.died) { target.alive = false; player.kills++; this.io.emit('kill', { killerId: player.id, killerName: player.name, victimId: target.id, victimName: target.name }); }
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
        const item = {
            id,
            x: Math.random() * (WORLD_W - 100) + 50,
            y: Math.random() * (WORLD_H - 100) + 50,
            spawnedAt: now,
            expiresAt: now + ITEM_EXPIRE_MS,
        };
        this.items.push(item);
        this.io.emit('itemSpawn', { id: item.id, x: item.x, y: item.y, expiresAt: item.expiresAt });
    }

    // ── 아이템 획득 결과 결정 ────────────────────────────────────
    _rollItem(player) {
        const randType = () => SKILL_TYPES[Math.floor(Math.random() * SKILL_TYPES.length)];

        // 디버그: 레벨 고정
        if (DEBUG_ITEM_LEVEL !== null) {
            return { level: DEBUG_ITEM_LEVEL, type: randType() };
        }

        // Lv4 체크 (Lv3 보유자만)
        if (player.hasLv3Skill() && Math.random() < ITEM_PROB_LV4) {
            return { level: 4, type: randType() };
        }
        const r = Math.random();
        if (r < ITEM_PROB_LV1) return { level: 1, type: randType() };
        if (r < ITEM_PROB_LV2) return { level: 2, type: randType() };
        if (r < ITEM_PROB_LV3) return { level: 3, type: randType() };
        return { curse: true };
    }

    // ── 아이템 획득 처리 ─────────────────────────────────────────
    _pickupItem(player, item) {
        const result = this._rollItem(player);

        if (result.curse) {
            // 저주: 보유 스킬 중 랜덤 대상
            const owned = player.skills.map((s, i) => s ? i : -1).filter(i => i >= 0);
            if (owned.length === 0) {
                this.io.to(player.id).emit('itemPickup', { itemId: item.id, result: { curse: true, effect: 'none' } });
                return;
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
            this.io.to(player.id).emit('itemPickup', { itemId: item.id, result: { curse: true, effect, ...slotInfo } });
            return;
        }

        const { level, type } = result;

        // 같은 타입 슬롯 찾기
        const sameIdx = player.skills.findIndex(s => s && s.type === type);
        if (sameIdx >= 0) {
            if (level > player.skills[sameIdx].level) {
                player.skills[sameIdx].level = level;
                this._emitPickup(player, item.id, level, type, sameIdx);
            } else {
                // 무시 (더 높은 레벨 유지)
                this.io.to(player.id).emit('itemPickup', { itemId: item.id, result: { ignored: true } });
            }
            return;
        }

        // 빈 슬롯 찾기
        const emptyIdx = player.skills.findIndex(s => s === null);
        if (emptyIdx >= 0) {
            player.skills[emptyIdx] = { type, level, cooldownUntil: 0 };
            this._emitPickup(player, item.id, level, type, emptyIdx);
            return;
        }

        // 꽉 참 → Lv4 제외 랜덤 교체
        const candidates = player.skills.map((s, i) => (s && s.level < 4) ? i : -1).filter(i => i >= 0);
        if (candidates.length === 0) {
            this.io.to(player.id).emit('itemPickup', { itemId: item.id, result: { ignored: true } });
            return;
        }
        const replaceIdx = candidates[Math.floor(Math.random() * candidates.length)];
        player.skills[replaceIdx] = { type, level, cooldownUntil: 0 };
        this._emitPickup(player, item.id, level, type, replaceIdx);
    }

    _emitPickup(player, itemId, level, type, slotIndex) {
        const isLegendary = level === 4;
        this.io.to(player.id).emit('itemPickup', {
            itemId,
            result: { level, type, slotIndex, legendary: isLegendary },
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

        // 아이템 픽업 감지
        for (const player of this.players.values()) {
            if (!player.alive) continue;
            for (let i = this.items.length - 1; i >= 0; i--) {
                const item = this.items[i];
                const dx = player.x - item.x;
                const dy = player.y - item.y;
                if (dx * dx + dy * dy <= ITEM_PICKUP_RANGE * ITEM_PICKUP_RANGE) {
                    this.items.splice(i, 1);
                    this._pickupItem(player, item);
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

                if (checkAttackHit(player, target)) {
                    const diff = player.level - target.level;
                    const modifier = diff >= 5
                        ? 1.2
                        : diff >= 0
                        ? 1 + diff * 0.04
                        : Math.max(0.6, 1 + diff * 0.01);
                    const finalDamage = Math.max(1, Math.round(player.damage * modifier));

                    // 방어막 반사
                    if (now < target.shieldUntil) {
                        const reflectDmg = Math.max(1, Math.round(finalDamage * target.shieldReflect));
                        const rr = applyDamage(player, reflectDmg, now);
                        if (rr.applied) {
                            this.io.emit('hit', { attackerId: target.id, targetId: player.id, damage: reflectDmg, targetHp: player.hp });
                            if (rr.died) {
                                player.alive = false;
                                target.kills++;
                                this.io.emit('kill', { killerId: target.id, killerName: target.name, victimId: player.id, victimName: player.name });
                            }
                        }
                        continue;
                    }

                    const result = applyDamage(target, finalDamage, now);
                    if (result.applied) {
                        this.io.emit('hit', { attackerId: player.id, targetId: target.id, damage: finalDamage, targetHp: target.hp });
                        if (result.died) {
                            target.alive = false;
                            player.kills++;
                            this.io.emit('kill', { killerId: player.id, killerName: player.name, victimId: target.id, victimName: target.name });
                        }
                    }
                }
            }
        }

        // 상태 브로드캐스트 — 본인은 풀 스냅샷, 상대는 peer 스냅샷
        const fullMap  = new Map([...this.players.values()].map(p => [p.id, p.toSnapshot()]));
        const peerList = [...this.players.values()].map(p => p.toPeerSnapshot());
        const itemsData = this.items.map(it => ({ id: it.id, x: it.x, y: it.y, expiresAt: it.expiresAt }));

        for (const pid of this.players.keys()) {
            const myFull = fullMap.get(pid);
            const others = peerList.filter(s => s.id !== pid);
            this.io.to(pid).emit('state', {
                tick: this.tickCount,
                players: [myFull, ...others],
                items: itemsData,
            });
        }
    }
}
