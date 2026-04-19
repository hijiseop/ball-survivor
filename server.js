import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getCharacterList, getCharacterBasicData } from './services/mapleStoryService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('templates'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'maple-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 24시간
}));

// 인증 미들웨어
function requireAuth(req, res, next) {
    if (!req.session?.apiKey) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    next();
}

// 로그인: API 키 검증 + 캐릭터 목록 조회
app.post('/api/login', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API 키를 입력해주세요.' });

    try {
        const characters = await getCharacterList(apiKey);
        req.session.apiKey = apiKey;
        req.session.characters = characters.map(c => c.character_name);
        res.json({ characters });
    } catch (error) {
        res.status(401).json({ error: 'API 키가 유효하지 않습니다.' });
    }
});

// 로그아웃
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// 캐릭터 선택 → 세션에 저장
app.post('/api/select', requireAuth, async (req, res) => {
    const { character_name } = req.body;
    if (!character_name) return res.status(400).json({ error: '캐릭터명이 필요합니다.' });

    const myCharacters = req.session.characters || [];
    if (!myCharacters.includes(character_name)) {
        return res.status(403).json({ error: '본인 계정의 캐릭터만 선택할 수 있습니다.' });
    }

    try {
        const data = await getCharacterBasicData(character_name, req.session.apiKey);
        req.session.selectedCharacter = data;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 선택된 캐릭터 정보 반환
app.get('/api/me', requireAuth, (req, res) => {
    if (!req.session.selectedCharacter) {
        return res.status(404).json({ error: '선택된 캐릭터가 없습니다.' });
    }
    res.json(req.session.selectedCharacter);
});

// 게임 페이지
app.get('/game', requireAuth, (req, res) => {
    if (!req.session.selectedCharacter) return res.redirect('/');
    res.sendFile(__dirname + '/templates/game.html');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/templates/index.html');
});

app.listen(port, () => {
    console.log(`✅ Server listening on http://localhost:${port}`);
});
