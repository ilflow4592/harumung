# 하루멍

애견유치원 원장이 촬영 전에 강아지를 지정해 찍고, 세션 검수 후 강아지별 앨범 링크를 보호자에게 보내는 앱.

| 폴더 | 내용 |
|---|---|
| `app/` | React Native (Expo, TypeScript). `modules/media-tools`는 영상 변환·트림·무음·프레임 캡처 네이티브 모듈 (Android Media3 / iOS AVFoundation) |
| `server/` | Kotlin + Spring Boot 4, MySQL 8, Flyway. 보호자 앨범 웹(`/a/{token}`) 포함 |

스펙: Obsidian `startup/애견유치원-사진분류/spec.md`, `dev-spec.md`. 디자인: https://claude.ai/artifact/EgGLUND2Aa2Y1QLXQfm33A

## 앱

```bash
cd app
npm install
npx tsc --noEmit            # 타입 검사
npx expo prebuild           # 네이티브 프로젝트 생성 (Xcode·Android SDK 필요)
npx expo run:android        # 또는 eas build --profile development
```

Expo Go는 쓰지 않는다. 네이티브 모듈이 있어서 개발 빌드(dev client)가 필요하다.

## 서버

```bash
cd server
docker compose up -d        # MySQL 8.4
./gradlew bootRun
curl localhost:8080/actuator/health
```

## 0주차 체크리스트

- [ ] 실기기 3대(안드로이드 구형 1대 포함)에서 촬영·720p 변환
- [ ] 카카오 비즈니스 채널 개설, 알림톡 템플릿 심사 신청
- [ ] Apple 개발자 계정, Play 콘솔 계정
- [ ] EAS 프로젝트 연결 (`npx eas init`)
