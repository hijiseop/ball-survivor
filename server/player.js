import { WORLD_W, WORLD_H } from '../shared/constants.js';

export class Player {
    constructor(id, name, characterLevel, combatPower, characterImageUrl) {
        this.id = id;
        this.name = name;
        this.x = Math.random() * (WORLD_W - 100) + 50;
        this.y = Math.random() * (WORLD_H - 100) + 50;
        this.targetX = this.x;
        this.targetY = this.y;
        // 캐릭터 레벨 = 최대 HP, 전투력 기반 데미지 (SPEC 준수)
        this.maxHp = characterLevel || 100;
        this.hp = this.maxHp;
        this.damage = Math.max(1, Math.floor((combatPower || 10) / 10));
        this.facingRight = true;
        this.attackUntil = 0;          // 공격 모션 종료 타임스탬프
        this.nextAttackAt = Date.now() + 2000; // 입장 2초 뒤 첫 공격 가능
        this.invincibleUntil = 0;      // 무적 종료 타임스탬프
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
            alive: this.alive,
            kills: this.kills,
            characterImageUrl: this.characterImageUrl,
        };
    }
}
