import { updatePosition, checkAttackHit, applyDamage } from '../shared/game-logic.js';
import {
    SERVER_TICK_MS, SERVER_TICK_RATE,
    ATTACK_INTERVAL, ATTACK_DURATION,
    GRID_CELL_SIZE, MAX_PLAYERS,
} from '../shared/constants.js';
import { Player } from './player.js';

export class GameRoom {
    constructor(io) {
        this.io = io;
        this.players = new Map(); // socketId → Player
        this.tickCount = 0;
        this._interval = null;
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
                    const result = applyDamage(target, finalDamage, now);
                    if (result.applied) {
                        this.io.emit('hit', {
                            attackerId: player.id,
                            targetId: target.id,
                            damage: player.damage,
                            targetHp: target.hp,
                        });

                        if (result.died) {
                            target.alive = false;
                            player.kills++;
                            this.io.emit('kill', {
                                killerId: player.id,
                                killerName: player.name,
                                victimId: target.id,
                                victimName: target.name,
                            });
                        }
                    }
                }
            }
        }

        // 상태 브로드캐스트
        const snapshot = [...this.players.values()].map(p => p.toSnapshot());
        this.io.emit('state', { tick: this.tickCount, players: snapshot });
    }
}
