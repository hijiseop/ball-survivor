# 📈 진행판

## 🎯 목표
- [x] Nexon Open API 연동 (캐릭터 조회)
- [x] API 키 로그인 / 내 캐릭터만 검색
- [x] Ball Survivor 게임 구현
- [x] 캐릭터 애니메이션 (stand / walk / attack)
- [ ] 멀티플레이 (Socket.io)

## ✅ 완료 항목

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
- **히트박스**: 직사각형 판정 (캐릭터 몸통 기준)
- **HP**: 캐릭터 레벨 그대로 (Lv.200 → HP 200)
- **공**: 5개 시작, 10초마다 +1개 / 속도 +0.5
- **데미지**: 10 시작, 20초마다 x1.5
- **공격**: 5초마다 자동 발동, 공격 중 접촉한 공 제거
- **무적**: 피격 후 1.5초
- 생존 시간 / 최고 기록 표시, 클릭으로 재시작

## 📝 로그
- 2026-04-08 : 프로젝트 초기화
- 2026-04-15 : Nexon API 연동, 로그인/캐릭터 선택 구현
- 2026-04-15 : Ball Survivor 게임 완성 (애니메이션, 히트박스, 공격 모션)
- 2026-04-15 : 불필요 파일 정리 (app.py, requirements.txt, .opencode/)

## 🔜 다음 목표
- Socket.io 멀티플레이 (배틀로얄 방식)
