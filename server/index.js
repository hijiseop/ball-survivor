import express from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

import { getCharacterList, getCharacterBasicData } from '../services/mapleStoryService.js';
import { GameRoom } from './game-room.js';
import { WORLD_W, WORLD_H, SERVER_TICK_RATE } from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const port = process.env.PORT || 3000;

// ── 미들웨어 ──────────────────────────────────────────
app.use(express.json());

// 세션 미들웨어를 변수로 추출 → Socket.io와 공유
if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24시간
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
    },
});
app.use(sessionMiddleware);
// Socket.io 연결에도 동일한 세션 적용 (join 이벤트에서 서버 세션으로 캐릭터 정보 검증)
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// ── 정적 파일 서빙 ────────────────────────────────────
app.use('/shared', express.static(join(ROOT, 'shared')));
app.use('/client', express.static(join(ROOT, 'client')));
app.use(express.static(join(ROOT, 'public')));

// ── 인증 미들웨어 ─────────────────────────────────────
function requireAuth(req, res, next) {
    if (!req.session?.apiKey) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    next();
}

// ── Auth API 라우트 ───────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API 키를 입력해주세요.' });

    try {
        const characters = await getCharacterList(apiKey);
        req.session.apiKey = apiKey;
        req.session.characters = characters.map(c => c.character_name);
        res.json({ characters });
    } catch {
        res.status(401).json({ error: 'API 키가 유효하지 않습니다.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

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

app.get('/api/me', requireAuth, (req, res) => {
    if (!req.session.selectedCharacter) {
        return res.status(404).json({ error: '선택된 캐릭터가 없습니다.' });
    }
    res.json(req.session.selectedCharacter);
});

// ── 페이지 라우트 ─────────────────────────────────────
app.get('/game', requireAuth, (req, res) => {
    if (!req.session.selectedCharacter) return res.redirect('/');
    res.sendFile(join(ROOT, 'templates', 'game.html'));
});

app.get('/', (req, res) => {
    res.sendFile(join(ROOT, 'templates', 'index.html'));
});

// ── Socket.io PvP ─────────────────────────────────────
const room = new GameRoom(io);
room.start();

io.on('connection', (socket) => {
    console.log(`socket connect: ${socket.id}`);

    // 연결 즉시 welcome 전송 → 클라이언트가 join 보낼 수 있게 함
    socket.emit('welcome', {
        id: socket.id,
        worldW: WORLD_W,
        worldH: WORLD_H,
        tickRate: SERVER_TICK_RATE,
    });

    socket.on('join', () => {
        // 클라이언트 제공 데이터 무시 — 서버 세션에서 직접 읽어 스탯 조작 방지
        const charData = socket.request.session?.selectedCharacter;
        if (!charData) { socket.disconnect(true); return; }

        room.join(socket, {
            characterName:     charData.character_name,
            characterLevel:    charData.character_level,
            combatPower:       charData.combat_power,
            combatPowerRaw:    charData.combat_power_raw ?? 0,
            bossDmg:           charData.boss_dmg ?? 0,
            critDmg:           charData.crit_dmg ?? 0,
            characterImageUrl: charData.character_image,
        });
    });

    socket.on('input', ({ targetX, targetY }) => {
        // 숫자 타입 + 유한값 검증 — NaN/Infinity 전송으로 게임 상태 오염 방지
        if (typeof targetX !== 'number' || typeof targetY !== 'number') return;
        if (!isFinite(targetX) || !isFinite(targetY)) return;
        room.setInput(socket.id, targetX, targetY);
    });

    socket.on('disconnect', () => {
        room.leave(socket.id);
    });
});

// ── 서버 시작 ─────────────────────────────────────────
httpServer.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
