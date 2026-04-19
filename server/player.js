import { WORLD_W, WORLD_H } from '../shared/constants.js';

export class Player {
    constructor(id, name, characterLevel, combatPower, characterImageUrl, combatPowerRaw = 0, bossDmg = 0, critDmg = 0) {
        this.id = id;
        this.name = name;
        this.x = Math.random() * (WORLD_W - 100) + 50;
        this.y = Math.random() * (WORLD_H - 100) + 50;
        this.targetX = this.x;
        this.targetY = this.y;
        this.level = characterLevel || 1;
        this.maxHp = characterLevel || 100;
        this.hp = this.maxHp;
        this.combatPower = combatPowerRaw;  // 표시용 원본 전투력

        // PvP 데미지: 전투력 기반 × 보스 데미지 보정 × 크뎀 보정
        const base = Math.max(1, Math.floor((combatPower || 10) / 10));
        this.damage = Math.max(1, Math.round(base * (1 + bossDmg / 100) * (1 + critDmg / 100)));

        this.facingRight = true;
        this.attackUntil = 0;
        this.nextAttackAt = Date.now() + 2000;
        this.invincibleUntil = 0;
        this.alive = true;
        this.kills = 0;
        this.characterImageUrl = characterImageUrl || '';
    }

    toSnapshot() {
        return {
            id: this.id,
            name: this.name,
            x: Math.round(this.x),
            y: Math.round(this.y),
            hp: this.hp,
            maxHp: this.maxHp,
            facingRight: this.facingRight,
            attackUntil: this.attackUntil,
            nextAttackAt: this.nextAttackAt,
            alive: this.alive,
            kills: this.kills,
            combatPower: this.combatPower,
            damage: this.damage,
            characterImageUrl: this.characterImageUrl,
        };
    }
}
