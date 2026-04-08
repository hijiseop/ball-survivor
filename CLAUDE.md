# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 🚀 [프로젝트명]

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

## ⚡ 효율 규칙
- 이미 읽은 파일 재읽기 금지
- 도구 호출 병렬 실행
- 독립적인 파일 구현은 서브에이전트 위임
- 설명한 내용 반복 금지

## ⚖️ 보안
- 외부 노출/DB → .claude/SECURITY.md 준수
- 내부 유틸 → 보안 절차 생략

## 💡 퀵 매뉴얼
- 시작: "CLAUDE.md 읽고 Architect 모드로 [기능명] 설계해줘"
- 진행: "Builder로 구현하고 Reviewer 검수까지 마쳐줘"
- 마무리: "Tester/Doc 주석 달고 PROGRESS.md 업데이트 후 /compact"
