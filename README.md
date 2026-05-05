# Ball Survivor PvP

메이플스토리 캐릭터로 즐기는 실시간 배틀로얄.  
Nexon Open API로 로그인 → 내 캐릭터 선택 → 서버 입장 → PvP.

## 실행

```bash
npm install
npm start
# http://localhost:3000
```

개발 중 자동 재시작이 필요하면:

```bash
npm run dev
```

## 환경변수

`.env.example` 복사 후 값 입력:

```
SESSION_SECRET=your_secret_here
```

선택 환경변수:

```
PORT=3000
DEBUG_START_SKILLS=true
DEBUG_ITEM_LEVEL=4
```

`DEBUG_*` 값은 테스트용이며 production에서는 사용할 수 없습니다.

## 주요 기능

- Nexon Open API 키 로그인 및 본인 캐릭터 선택
- Socket.io 기반 실시간 PvP 배틀로얄
- 서버 권위 이동·공격·데미지 판정
- 캐릭터 stand / walk / attack / skill 애니메이션
- 랜덤 아이템 스킬 시스템: 폭발, 방어막, 대쉬, 회복 (빈 슬롯이 있으면 저주 없음)
- 보상 레벨별 픽업 이펙트: Lv4 전설 잭팟, 저주 전용 불길한 연출
- 맵 장애물: 서버 권위 충돌, 대쉬 차단, 미니맵 표시
- 리스폰, 부활 무적, 관전 모드, 게임 종료 후 자동 재시작
- 킬로그, 리더보드, 미니맵, 모바일 터치 UI

## 조작

- 이동: 마우스 이동 또는 화면 터치
- 스킬: `Q`, `E`, `R` 또는 모바일 스킬 버튼
- 리더보드: `Tab` 또는 우측 상단 버튼
- 관전 대상 변경: 사망 후 좌우 방향키 또는 화면 좌우 터치

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
  input.js              # 마우스·터치·스킬 입력
  hud/
    killfeed.js         # 킬로그 피드 HUD
    leaderboard.js      # 리더보드 HUD
  effects/
    pickup-effects.js   # 아이템 보상/저주 픽업 이펙트

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
