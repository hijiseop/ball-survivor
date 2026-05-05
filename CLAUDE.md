# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 🚀 Ball Survivor PvP

메이플스토리 캐릭터로 즐기는 Socket.io 기반 실시간 PvP 배틀로얄 프로젝트.
Nexon Open API 인증, Express 세션, Canvas 클라이언트, 서버 권위 게임 로직을 사용한다.

## 🎭 역할
| 단계 | 역할 | 산출물 |
| :--- | :--- | :--- |
| **Architect** | 설계 + 보안 판단 | `SPEC.md` |
| **Builder** | 구현 | 소스코드 |
| **Reviewer** | 검수 | 수정 요청 |
| **Tester/Doc** | 검증 + 기록 | `PROGRESS.md` |

## 🔄 프로세스
1. Plan: Architect → SPEC.md 작성
2. Build: Builder → SPEC.md 기반 구현
3. Review: Reviewer → SECURITY.md 준수 확인
4. Finalize: Tester/Doc → 테스트 + Why 주석

## 🛠️ 실행/검증
- 설치: `npm install`
- 실행: `npm start`
- 개발 실행: `npm run dev`
- 접속: `http://localhost:3000`
- 필수 환경변수: `SESSION_SECRET`
- 테스트용 환경변수: `DEBUG_START_SKILLS`, `DEBUG_ITEM_LEVEL`

## 🧭 현재 구조
- `server/index.js`: Express + Socket.io 진입점, Auth API, 세션 공유
- `server/game-room.js`: 20Hz 게임 루프, PvP 판정, 아이템/스킬/리스폰/게임 종료
- `server/player.js`: Player 상태와 스냅샷
- `server/services/mapleStoryService.js`: Nexon Open API 래퍼
- `shared/constants.js`: 서버·클라 공유 상수
- `shared/game-logic.js`: 이동, 충돌, 데미지, 스킬 효과 로직
- `client/game.js`: 클라이언트 초기화와 이벤트 조립
- `client/renderer.js`: Canvas 렌더링 조립, 월드 레이어, 관전/종료 화면
- `client/input.js`: 마우스, 터치, 스킬, 관전 입력
- `client/hud/`: 킬로그, 리더보드 등 HUD 모듈
- `client/effects/`: 픽업 등 화면 이펙트 모듈
- `templates/`: 로그인/게임 HTML
- `public/`: 정적 에셋

## ⚡ 효율 규칙
- 이미 읽은 파일 재읽기 금지
- 도구 호출 병렬 실행
- 독립적인 파일 구현은 서브에이전트 위임
- 설명한 내용 반복 금지

## ⚖️ 보안
- 외부 노출/DB → .claude/SECURITY.md 준수
- 내부 유틸 → 보안 절차 생략
- Socket.io `join`은 클라이언트 페이로드를 신뢰하지 말고 서버 세션의 캐릭터 정보를 기준으로 처리
- 입력 좌표는 NaN/Infinity 및 월드 범위 검증 유지
- production에서 `DEBUG_*` 환경변수 사용 금지

## 💡 퀵 매뉴얼
- 시작: "CLAUDE.md 읽고 Architect 모드로 [기능명] 설계해줘"
- 진행: "Builder로 구현하고 Reviewer 검수까지 마쳐줘"
- 마무리: "Tester/Doc 주석 달고 PROGRESS.md 업데이트 후 /compact"

## 📝 문서 동기화
- 기능 변경 시 `README.md`, `SPEC.md`, `PROGRESS.md`를 함께 확인
- 완료 기록은 `PROGRESS.md` 로그에 날짜별로 추가
- API, Socket.io 이벤트, 파일 구조가 바뀌면 `SPEC.md`를 먼저 갱신
