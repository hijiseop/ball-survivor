# 📈 진행판

## 🎯 목표
- [x] Nexon Open API 연동 (캐릭터 조회)
- [x] API 키 로그인 / 내 캐릭터만 검색
- [x] Ball Survivor 게임 구현
- [x] 캐릭터 애니메이션 (stand / walk / attack)
- [x] PvP 서버 아키텍처 설계 (SPEC.md)
- [x] 공유 로직 모듈 (shared/)
- [x] 멀티플레이 서버 구현 (Socket.io)
- [x] 멀티플레이 클라이언트 구현 (client/)
- [x] game.html PvP 전환
- [x] 그리드 기반 공간 분할 최적화 (O(n²) → 근접 셀)
- [x] 최대 인원 제한 (20명)
- [x] 킬로그 피드 (좌측 하단, fade-out)
- [x] 실시간 리더보드 (우측 상단, 킬 수 기준 top5)
- [x] 파일 구조 정리 (services/ → server/services/, 구버전 server.js 삭제)
- [x] 문서 동기화 (README, SPEC, PROGRESS 현행화)

## ✅ 완료 항목

### PvP 클라이언트 (client/ + templates/game.html)
- **client/network.js** : Socket.io 클라이언트 래퍼
  - `connect()` — `io()` 연결 + welcome/state/hit/kill/playerJoin/playerLeave/disconnect 핸들러
  - `join()` — 게임 입장 (서버가 세션에서 캐릭터 정보 읽음)
  - `sendInput(x, y)` — 마우스 타겟 월드 좌표 전송 (connected 체크)
  - `on(event, fn)` — 이벤트 핸들러 등록
- **client/input.js** : 마우스/터치 입력 처리
  - `init(canvas)` — mousemove + touchstart/move/end 리스너 등록
  - 마우스 데드존 (중앙 40px): 정지 판정, 터치는 손 떼면 자동 정지
  - `getWorldTarget(camX, camY, zoom)` — 스크린 좌표 → 월드 좌표 변환
  - `getScreenPos()` — 스크린 좌표 + 데드존 여부 + 거리 반환 (커서 렌더용)
- **client/renderer.js** : Canvas 렌더링 (멀티플레이어 확장)
  - 이미지 캐시 : `characterImageUrl` 기반, 신규 플레이어 등장 시 비동기 프리로드
  - 보간 : 이전 state ↔ 현재 state 선형 보간 (t = elapsed / SERVER_TICK_MS)
  - 애니메이션 상태 : 플레이어별 Map 관리 (stand/walk/attack), 위치 변화로 walkUntil 갱신
  - 피격 깜빡임 : `notifyHit(id)` → `INVINCIBLE_MS` 동안 100ms 주기 깜빡임
  - 카메라 : 내 캐릭터 추적, 기존 ZOOM 로직 동일
  - HUD : 내 HP바 + 킬수 + 생존자 수 (상단 중앙)
  - 미니맵 : 전체 플레이어 표시 (내 캐릭터 = 파란 점, 타인 = 빨간 점, 사망자 = 회색)
- **client/game.js** : 클라이언트 메인 (조립 + 초기화)
  - `/api/me` → `Renderer.init()` → `Input.init()` → `Network.connect()` 순서 초기화
  - `welcome` 수신 시 `join` 전송 + 렌더 루프 시작
  - 입력 전송: `setInterval(SERVER_TICK_MS)` — 20Hz 서버 틱과 동기화
- **templates/game.html** : PvP 전환 완료
  - 인라인 `<script>` 전체 제거 → `socket.io.js` + `<script type="module" src="/client/game.js">`
  - `#backBtn`, `#loading`, `#gameCanvas` 요소 유지

### PvP 서버 (server/ + shared/)
- **SPEC.md** : PvP 배틀로얄 전체 설계 (아키텍처, 이벤트 프로토콜, 파일 구조)
- **shared/constants.js** : 서버·클라 공유 상수 (월드, 틱, 전투, 히트박스, 스프라이트)
- **shared/game-logic.js** : 서버 권위적 게임 로직
  - `updatePosition(player, dt)` — 델타타임 이동 + 맵 경계 클램프
  - `checkAttackHit(attacker, target)` — 히트박스 중심 거리 판정
  - `applyDamage(target, damage, now)` — 무적 시간 체크 후 HP 차감
- **server/player.js** : Player 클래스 (랜덤 스폰, 상태 스냅샷, 공격/무적 타이머)
- **server/game-room.js** : 20Hz 틱 루프
  - 매 틱: 이동 → 자동공격 판정 → hit/kill 브로드캐스트 → state 브로드캐스트
  - join/leave 이벤트 처리
- **server/index.js** : Express + Socket.io 진입점 (기존 server.js 대체)
  - 기존 Auth API 전체 유지 (`/api/login`, `/api/select`, `/api/me`, `/api/logout`)
  - `/shared`, `/client`, `/public` 정적 서빙
  - Socket.io 이벤트: `join`, `input`, `disconnect`
- **services/mapleStoryService.js** : CommonJS → ESM 마이그레이션
- **package.json** : `type: "module"` 전환, `socket.io ^4.7.0` 추가

### 백엔드 (server.js / mapleStoryService.js)
- Nexon Open API 연동 (`x-nxopen-api-key` 헤더 방식)
- `POST /api/login` : API 키 검증 + 캐릭터 목록 조회 → 세션 저장
- `POST /api/select` : 캐릭터 선택 → 기본 정보 조회 후 세션 저장
- `GET /api/me` : 선택된 캐릭터 정보 반환
- `GET /game` : 게임 페이지 (로그인 + 캐릭터 선택 필요)
- `POST /api/logout` : 세션 삭제
- `/maplestory/v1/character/list` 로 내 캐릭터 목록 조회, 레벨 내림차순 정렬
- 본인 계정 캐릭터만 조회 가능하도록 서버에서 검증

### 프론트엔드 (index.html)
- API 키 입력 로그인 화면
- 로그인 성공 시 내 캐릭터 드롭다운 (레벨 표시, 내림차순 정렬)
- 캐릭터 선택 → `/game` 이동

### 게임 (game.html)
- Canvas 기반 Ball Survivor 게임
- 마우스로 캐릭터 이동
- **캐릭터 애니메이션**: Nexon `/static/maplestory/character/look/` 엔드포인트 활용
  - 정지: `A00.x`, 걷기: `A02.x`, 공격: `A13/A14/A15` 무작위 순서 연속 재생
  - 프리로드 후 `ctx.drawImage()` 직접 렌더링 (추가 API 호출 없음)
  - `CHAR_SCALE` 하나로 캐릭터 크기 / 히트박스 / 위치 전체 비율 조정
  - 상하좌우 이동 방향에 따른 캐릭터 이미지 전환 (좌우 반전 포함)
- **배경**: `battlemap.png` 실제 맵 이미지 적용 (월드 크기 이미지 기준으로 자동 설정)
- **카메라**: 줌(`ZOOM`) + 캐릭터 추적 카메라, 월드↔스크린 좌표 변환
- **히트박스**: 직사각형 판정 (캐릭터 몸통 기준)
- **HP**: 캐릭터 레벨 그대로 (Lv.200 → HP 200)
- **전투력**: 캐릭터 선택 시 stat API 병렬 호출 → 억 단위 버림 표시 (1000만 이하 = 1), HUD 우측에 표시
- **머리 위 HP바**: 히트박스 너비 기준, 히트박스 상단 3px 위, 반투명
- **공**: 5개 시작, 10초마다 +1개 / 속도 +0.5
- **받는 피해 (적 공격력)**: 10 시작, 20초마다 x1.5
- **공격**: 5초마다 자동 발동, 공격 중 접촉한 공 제거
- **무적**: 피격 후 1.5초
- 생존 시간 / 최고 기록 표시, 클릭으로 재시작

## 📝 로그
- 2026-04-21 : 입력/UX 개선 + 모바일 터치 지원
  - client/input.js: 마우스 데드존 (중앙 40px 반경 내 정지), 터치 이벤트 추가 (touchstart/move/end), 손 떼면 자동 정지
  - client/renderer.js: 타겟 커서 (십자선) — 이동 중에만 표시, 거리 비례 투명도, 데드존 진입 시 사라짐
  - client/renderer.js: HUD 반응형 스케일 (hudScale = VIEW_W/560 기준, 모바일 겹침 방지)
  - client/renderer.js: 생존 수 우측 상단 텍스트로 이동 (가운데 패널 제거)
  - client/hud-leaderboard.js: Tab 키 + 🏆 버튼(탭/클릭)으로 리더보드 토글, on/off 투명도 표시
  - client/renderer.js: canvas cursor:none 적용, 미니맵/리더보드 ctx.scale 기반 스케일 적용
- 2026-04-20 : 킬로그 피드 + 리더보드 + 파일 정리
  - client/hud-killfeed.js: 킬로그 피드 모듈 (최신 5개, 3초 fade-out, 좌측 하단)
  - client/hud-leaderboard.js: 리더보드 모듈 (킬 수 내림차순 top5, 우측 상단, 내 캐릭터 강조)
  - server/game-room.js: kill 이벤트에 killerName, victimName 추가
  - client/renderer.js: KillFeed.draw(), Leaderboard.draw() 조립, DEBUG 플래그 false
  - client/game.js: kill 이벤트 수신 시 KillFeed.addKill() 호출
  - services/ → server/services/ 이동, server.js·pvp-architecture-spec.md 삭제
  - README.md 전면 재작성, SPEC.md §4/5/8/13/15 현행화
- 2026-04-19 : 그리드 기반 공간 분할 최적화 + 최대 인원 제한
  - shared/constants.js: GRID_CELL_SIZE=100, MAX_PLAYERS=20 추가
  - server/game-room.js: _buildGrid() / _getNeighbors() 구현 — 공격 판정 O(n²) → 근접 3×3 셀만 체크
  - server/game-room.js: join() 시 20명 초과 시 roomFull 이벤트 후 강제 종료
  - client/network.js: roomFull 이벤트 수신 등록
  - client/game.js: roomFull 수신 시 알림 후 로비 이동
- 2026-04-19 : 이펙트 시스템 구현
  - client/renderer.js: 공격 이펙트 — 펄스 글로우 + 링 확산 2개 + 파티클 12개
  - client/renderer.js: 레벨 기반 안쪽 글로우 색 (보라~골드 10단계), 데미지 기반 바깥 링 색
  - client/renderer.js: 피격 시 화면 빨간 플래시 + 카메라 쉐이크 (내가 맞을 때만)
  - client/renderer.js: DEBUG_HITBOX / DEBUG_ATTACK_RANGE 플래그 정리
- 2026-04-19 : 전투 시스템 개선
  - server/index.js: 연결 즉시 welcome 전송 (데드락 수정)
  - server/index.js: WORLD_W/H/SERVER_TICK_RATE import 추가
  - services/mapleStoryService.js: parseInt 쉼표 파싱 버그 수정, boss_dmg/crit_dmg 추가
  - server/player.js: level 별도 저장, combatPowerRaw(표시용), PvP 데미지 공식 (보공×크뎀 보정)
  - server/game-room.js: 레벨 차이 기반 데미지 배율 (+5이상 120% / -40이하 60%)
  - shared/game-logic.js: 공격 판정 → 공격 원 vs 히트박스 사각형 교차 (AABB+Circle)
  - shared/constants.js: ATTACK_RANGE 60→28 (히트박스 모서리 기준), HIT_H 50→48
  - client/renderer.js: 공격 쿨다운 HUD 복원 (우측 상단), 전투력/PvP데미지 HUD 추가
  - client/renderer.js: 공격 애니메이션 A13/A14/A15 중 하나 랜덤 선택 (attackUntil 변경 시 교체)
  - client/renderer.js: 이름/HP바 위치 이미지 높이 비율 기반으로 조정
  - client/renderer.js: DEBUG_HITBOX / DEBUG_ATTACK_RANGE 디버그 플래그 추가
- 2026-04-16 : 보안 리뷰 + 코드 정리
  - server/index.js: Socket.io 세션 공유, join 시 서버 세션 검증 (스탯 조작 방지)
  - server/index.js: input 좌표 NaN/Infinity 검증
  - server/game-room.js: 사망 시 `target.alive = false` 누락 버그 수정
  - client/renderer.js: 미사용 import 제거, ACTION_ATTACKS 상수 활용
  - client/network.js, game.js: join 페이로드 제거 (서버 세션 사용)
  - public/battlemap.png 이동 완료
- 2026-04-16 : PvP 클라이언트 구현 완료 (network.js, input.js, renderer.js, game.js, game.html PvP 전환)
- 2026-04-16 : PvP SPEC.md 설계 완료 (아키텍처, 이벤트 프로토콜, 파일 구조)
- 2026-04-16 : shared/ 구현 (constants.js, game-logic.js)
- 2026-04-16 : server/ 구현 완료 (player.js, game-room.js, index.js)
- 2026-04-16 : ESM 마이그레이션 (package.json, mapleStoryService.js)
- 2026-04-16 : socket.io 설치 및 서버 기동 확인
- 2026-04-08 : 프로젝트 초기화
- 2026-04-15 : Nexon API 연동, 로그인/캐릭터 선택 구현
- 2026-04-15 : Ball Survivor 게임 완성 (애니메이션, 히트박스, 공격 모션)
- 2026-04-15 : 불필요 파일 정리 (app.py, requirements.txt, .opencode/)
- 2026-04-15 : 배경 이미지(battlemap.png) 적용, 카메라 줌/추적 시스템 구현
- 2026-04-15 : 캐릭터 상하좌우 이동 방향별 이미지 전환 구현
- 2026-04-15 : 캐릭터 이동 속도 델타타임 기반으로 변경 (프레임레이트 독립)
- 2026-04-15 : HUD 공격 쿨다운 표시 개선 (글씨 확대, 준비 완료 시 깜빡임)
- 2026-04-15 : HUD "데미지" → "받는 피해"로 명칭 변경
- 2026-04-15 : 전투력 스텟 추가 (stat API 연동, HUD 표시)
- 2026-04-15 : 캐릭터 머리 위 반투명 HP바 추가

## 🔜 다음 목표
- 멀티탭 통합 테스트 (브라우저 2개 이상으로 실제 PvP 검증)
- 리스폰 (사망 후 3초 뒤 랜덤 위치)
- 축소 존 (배틀로얄 존)
- HP 회복 아이템 드롭
