# Ball Survivor PvP

메이플스토리 캐릭터로 즐기는 실시간 배틀로얄.  
Nexon Open API로 로그인 → 내 캐릭터 선택 → 서버 입장 → PvP.

## 실행

```bash
npm install
node server/index.js
# http://localhost:3000
```

## 환경변수

`.env.example` 복사 후 값 입력:

```
SESSION_SECRET=your_secret_here
```

## 구조

```
server/
  index.js              # Express + Socket.io 진입점
  game-room.js          # 20Hz 게임 틱 루프
  player.js             # Player 클래스
  services/
    mapleStoryService.js  # Nexon Open API 래퍼

shared/
  constants.js          # 서버·클라 공유 상수
  game-logic.js         # 이동·충돌·데미지 로직

client/
  game.js               # 클라이언트 메인
  renderer.js           # Canvas 렌더링
  network.js            # Socket.io 래퍼
  input.js              # 마우스 입력
  hud-killfeed.js       # 킬로그 피드 HUD
  hud-leaderboard.js    # 리더보드 HUD

templates/
  index.html            # 로그인·캐릭터 선택
  game.html             # 게임

public/
  battlemap.png         # 배경 이미지
```

## Auth API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/login` | Nexon API 키 검증 + 캐릭터 목록 반환 |
| POST | `/api/select` | 캐릭터 선택 → 세션 저장 |
| GET  | `/api/me` | 현재 선택된 캐릭터 정보 |
| POST | `/api/logout` | 세션 삭제 |
