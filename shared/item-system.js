import { ITEM_DEFAULT_GRADE, ITEM_GRADES, SKILL_TYPES } from './constants.js';

export function randomSkillType(rng = Math.random) {
    return SKILL_TYPES[Math.floor(rng() * SKILL_TYPES.length)];
}

export function rollItemGrade(rng = Math.random) {
    const r = rng();
    let acc = 0;
    for (const [grade, config] of Object.entries(ITEM_GRADES)) {
        acc += config.spawnWeight;
        if (r < acc) return grade;
    }
    return ITEM_DEFAULT_GRADE;
}

export function rollItemReward(player, grade = ITEM_DEFAULT_GRADE, options = {}) {
    const rng = options.rng ?? Math.random;
    const debugLevel = options.debugLevel ?? null;
    const config = ITEM_GRADES[grade] ?? ITEM_GRADES[ITEM_DEFAULT_GRADE];
    const slotsFull = player.skills.every(Boolean);

    if (debugLevel !== null) {
        return { level: debugLevel, type: randomSkillType(rng), grade };
    }

    if (slotsFull && player.hasLv3Skill() && config.lv4 > 0 && rng() < config.lv4) {
        return { level: 4, type: randomSkillType(rng), grade };
    }

    if (slotsFull && config.curse > 0 && rng() < config.curse) {
        return { curse: true, grade };
    }

    const r = rng();
    if (r < config.lv1) return { level: 1, type: randomSkillType(rng), grade };
    if (r < config.lv2) return { level: 2, type: randomSkillType(rng), grade };
    return { level: 3, type: randomSkillType(rng), grade };
}
