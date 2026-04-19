import { updatePosition, checkAttackHit, applyDamage } from '../shared/game-logic.js';
import {
    SERVER_TICK_MS, SERVER_TICK_RATE,
    ATTACK_INTERVAL, ATTACK_DURATION,
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

    // 20Hz 틱 루프
    _tick() {
        const now = Date.now();
        const dt = SERVER_TICK_MS / 1000;
        this.tickCount++;

        for (const player of this.players.values()) {
            if (!player.alive) continue;

            // 이동 처리
            const { facingRight } = updatePosition(player, dt);
            if (facingRight !== undefined) player.facingRight = facingRight;

            // 자동 공격 처리
            if (now >= player.nextAttackAt) {
                player.nextAttackAt = now + ATTACK_INTERVAL;
                player.attackUntil = now + ATTACK_DURATION;

                for (const target of this.players.values()) {
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
                                    victimId: target.id,
                                });
                            }
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
