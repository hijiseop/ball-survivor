
## 1. Overview
- Node.js Express 서버를 사용하여 MapleStory 캐릭터 정보를 Nexon Open API에서 가져와 웹 페이지에 표시합니다.
- 클라이언트가 캐릭터명 입력 → ocid 조회 → 기본 정보 조회 → 화면 출력

## 2. Architecture
```
[HTML Page] → [Express Server (Node.js)] → [Nexon Open API]
```

## 3. Tech Stack
- Node.js / Express (웹 서버)
- Axios (API 호출)
- JavaScript/TypeScript (프론트엔드/백엔드 로직)
- HTML/CSS (프론트엔드)

## 4. API Endpoints

### GET /api/character?character_name=xxx
**Request:** 캐릭터명 (쿼리 파라미터)

**Response:**
```json
{
  "character_name": "string",
  "character_level": 0,
  "character_image": "url"
}
```

**Flow:**
1. `/maplestory/v1/id?character_name=xxx` → ocid 획득 (백엔드)
2. `/maplestory/v1/character/basic?ocid=xxx&date=today` → 기본 정보 획득 (백엔드)
3. 필요한 필드만 추출하여 반환 (백엔드)

## 5. File Structure
```
server.js         # Express 서버 엔트리 포인트
templates/
  index.html      # 캐릭터 검색 HTML (프론트엔드)
.env              # API 키 관리
package.json      # Node.js 의존성 관리
```

## 6. Environment Variables
- `NEXON_API_KEY`: Nexon Open API 키

## 7. Security
- API 키는 .env 파일로 관리 (gitignore에 추가)
- 외부 노출 금지
