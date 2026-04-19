import axios from 'axios';

/**
 * Nexon Open API 호출 공통 헬퍼
 */
function nexonGet(url, apiKey) {
    return axios.get(url, { headers: { 'x-nxopen-api-key': apiKey } });
}

/**
 * API 키로 계정의 캐릭터 목록 조회
 * @returns {Promise<string[]>} 캐릭터명 배열
 */
export async function getCharacterList(apiKey) {
    const res = await nexonGet(
        'https://open.api.nexon.com/maplestory/v1/character/list',
        apiKey
    );

    // 응답: { account_list: [{ world_name, character_list: [{ character_name, ... }] }] }
    const accountList = res.data?.account_list || [];
    const characters = [];
    for (const account of accountList) {
        for (const char of account.character_list || []) {
            if (char.character_name) {
                characters.push({
                    character_name: char.character_name,
                    character_level: char.character_level || 0,
                });
            }
        }
    }
    // 레벨 내림차순 정렬
    characters.sort((a, b) => b.character_level - a.character_level);
    return characters;
}

/**
 * 캐릭터명으로 기본 정보 조회
 * @returns {Promise<{character_name, character_level, character_image, combat_power}>}
 */
export async function getCharacterBasicData(characterName, apiKey) {
    if (!characterName) throw new Error('Character name is required.');

    try {
        // 1. OCID 조회
        const ocidRes = await nexonGet(
            `https://open.api.nexon.com/maplestory/v1/id?character_name=${encodeURIComponent(characterName)}`,
            apiKey
        );
        const ocid = ocidRes.data?.ocid;
        if (!ocid) throw new Error('Character ID (OCID) not found.');

        // 2. 기본 정보 + 스텟 병렬 조회
        const [basicRes, statRes] = await Promise.all([
            nexonGet(`https://open.api.nexon.com/maplestory/v1/character/basic?ocid=${ocid}`, apiKey),
            nexonGet(`https://open.api.nexon.com/maplestory/v1/character/stat?ocid=${ocid}`, apiKey),
        ]);

        const statList = statRes.data?.final_stat || statRes.data?.character_stat || [];

        const parseStat = (name) => {
            const val = statList.find(s => s.stat_name === name)?.stat_value || '0';
            return parseFloat(val.replace(/,/g, '')) || 0;
        };

        const rawPower  = parseStat('전투력');
        const boss_dmg  = parseStat('보스 몬스터 데미지');  // %
        const crit_dmg  = parseStat('크리티컬 데미지');     // %
        const combat_power = Math.max(1, Math.floor(rawPower / 10_000_000)); // PvP 데미지 계산용

        return {
            character_name: basicRes.data?.character_name || characterName,
            character_level: basicRes.data?.character_level || 0,
            character_image: basicRes.data?.character_image || '',
            combat_power,
            combat_power_raw: rawPower,
            boss_dmg,
            crit_dmg,
        };

    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 404) throw new Error('캐릭터를 찾을 수 없습니다.');
            if (error.response?.data?.message) throw new Error(error.response.data.message);
        }
        throw new Error('캐릭터 정보 조회에 실패했습니다.');
    }
}
