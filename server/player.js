import { WORLD_W, WORLD_H, MAX_SKILL_SLOTS } from '../shared/constants.js';

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
        this.combatPower = combatPowerRaw;

        const base = Math.max(1, Math.floor((combatPower || 10) / 10));
        this.damage = Math.max(1, Math.round(base * (1 + bossDmg / 100) * (1 + critDmg / 100)));

        this.facingRight = true;
        this.attackUntil = 0;
        this.nextAttackAt = Date.now() + 2000;
        this.invincibleUntil = 0;
        this.alive = true;
        this.kills = 0;
        this.characterImageUrl = characterImageUrl || '';

        // 스킬 슬롯: null | { type, level, cooldownUntil }
        this.skills = new Array(MAX_SKILL_SLOTS).fill(null);
        // 방어막
        this.shieldUntil = 0;
        this.shieldReflect = 0;
        this.skillUntil = 0;
        this.skillType  = '';
    }

    hasLv3Skill() {
        return this.skills.some(s => s && s.level >= 3);
    }

    // 본인에게만 전송 — 쿨다운 정확한 타임스탬프 포함
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
            skills: this.skills.map(s => s ? { type: s.type, level: s.level, cooldownUntil: s.cooldownUntil } : null),
            shieldUntil: this.shieldUntil,
            skillUntil: this.skillUntil,
            skillType:  this.skillType,
        };
    }

    // 상대에게 전송 — 쿨다운 타임스탬프/방어막 시각 제거
    toPeerSnapshot() {
        const now = Date.now();
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
            skills: this.skills.map(s => s ? { type: s.type, level: s.level } : null),
            shieldActive: now < this.shieldUntil,
            skillUntil: this.skillUntil,
            skillType:  this.skillType,
        };
    }
}
