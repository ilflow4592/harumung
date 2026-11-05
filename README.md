# 하루멍

애견유치원 원장이 촬영 전에 강아지를 지정해 찍고, 세션 검수 후 강아지별 앨범 링크를 보호자에게 보내는 앱.

| 폴더 | 내용 |
|---|---|
| `web/` | 브라우저 PWA. React + Vite + TypeScript. 카메라·녹화·IndexedDB(Dexie). 스토어·Apple 계정 없이 링크로 배포 |
| `server/` | Kotlin + Spring Boot 4, MySQL 8, Flyway. 보호자 앨범 웹(`/a/{token}`), ffmpeg 미디어 처리, PWA 정적 서빙 |

스펙: Obsidian `startup/애견유치원-사진분류/spec.md`, `dev-spec.md`. 디자인: https://claude.ai/artifact/EgGLUND2Aa2Y1QLXQfm33A
Expo 네이티브 버전은 커밋 06aeb7c에 보존.

## 웹 (개발)

```bash
cd web
npm install
npm run dev -- --host      # https://<맥 IP>:5173 (카메라는 https 필요, 자체 서명 인증서 경고는 "계속")
npm run build              # dist/ 생성
```

폰에서 열 때: 같은 Wi-Fi, 주소창에 https://<맥 IP>:5173, 인증서 경고 통과, 카메라 허용.
설치: 사파리 공유 → 홈 화면에 추가 (iOS), 크롬 메뉴 → 홈 화면에 추가 (Android).

## 서버

```bash
cd server
docker compose up -d        # MySQL 8.4
brew install ffmpeg         # 영상 변환 (없으면 ffmpeg 테스트는 건너뜀)
./gradlew bootRun
curl localhost:8080/actuator/health
```

배포 시 `web/dist/*`를 `server/src/main/resources/static/`에 복사하면 같은 서버에서 앱·API·앨범이 함께 뜬다.

## 0주차 체크리스트

- [ ] 아이폰 사파리·갤럭시 크롬 실기기에서 촬영·녹화·세션 검수
- [ ] 앱 전환 후 돌아왔을 때 카메라가 다시 켜지는지
- [ ] 카카오 비즈니스 채널 개설, 알림톡 템플릿 심사 신청
- [ ] Docker Desktop 실행 후 Flyway V1 적용 확인
