# 하루멍 이벤트 태깅 (PostHog)

설정: `web/.env`에 `VITE_POSTHOG_KEY`(프로젝트 API 키), `VITE_POSTHOG_HOST`. 키가 없으면 전부 꺼짐. 예시는 `.env.example`.

세션 녹화: 켜짐. 입력값 전부 마스킹, `.ph-mask`(보호자 연락처) 마스킹, `video`·`canvas` 차단. 사진은 blob URL이라 녹화에 안 남는다.

공통 속성(super property): `app_version`, `platform`(ios/android/other), `standalone`(홈 화면 설치 여부), `dev`.

| 이벤트 | 시점 | 속성 |
|---|---|---|
| `$pageview` | 화면 전환 | `screen`(ULID는 `:id`로 일반화) |
| `app_opened` | 앱 진입 | |
| `auto_purge_ran` | 앱 진입 시 자동 정리 실행 | `count`, `freed_bytes` |
| `guide_opened` | 사용 안내 진입 | `from`(folders/settings) |
| `guide_section_jumped` | 안내 목차 탭 | `section` |
| `guide_comic_started` | 안내 맨 위 8컷 만화의 2컷이 60% 이상 보이는 상태로 400ms 머묾 (1컷은 자동 노출이라 제외) | |
| `guide_comic_viewed` | 8컷 통과 | `seconds`(2컷→8컷), `panels_seen`(0~8), `skimmed`(4초 미만이면 true) |
| `guide_comic_abandoned` | 시작했지만 8컷 전에 안내를 떠남 (라우트 이동 시. 탭 종료는 누락 가능) | `max_panel`, `seconds` |
| `search_used` | 검색창 첫 글자 입력 | `screen` |
| `date_changed` | 날짜 이동 | `screen`, `offset_days` |
| `absent_toggled` | 안 온 아이 펼침/접기 | `show` |
| `dog_created` / `dog_updated` | 강아지 저장 | `has_photo`, `sex`, `phone_count`, `has_memo` |
| `dog_photo_picked` | 정면 사진 선택 | `editing` |
| `dog_retired` / `dog_restored` | 퇴원 / 복원 | |
| `dog_delete_attempted` | 완전 삭제 시도 | `ok` |
| `dog_sheet_action` | 강아지 메뉴 선택 | `action`(folder/edit) |
| `attendance_toggled` | 등원 탭 | `on`, `total_dogs` |
| `attendance_set_all` | 전체 선택/해제 | `count`, `total_dogs` |
| `camera_opened` | 카메라 진입 | `from`(folders/attendance/dog_sheet), `attended`, `dogs` |
| `camera_ready` | 스트림 열림 | `resolution`, `native_zoom` |
| `camera_error` | 스트림 실패 | `name` |
| `camera_mode_changed` | 사진/영상 전환 | `mode` |
| `hq_toggled` | HQ 토글 | `on` |
| `zoom_changed` | 줌 칩 탭 / 핀치 종료 | `zoom`, `via`(chip/pinch), `native` |
| `dog_toggled` | 스트립 강아지 탭 | `on`, `selected_after` |
| `selection_cleared` | 캡슐 ✕ | `had` |
| `strip_show_all` | + 전체 / 등원만 | `show` |
| `photo_captured` | 사진 저장 | `source`(sensor/preview/native), `dog_count`, `zoom`, `bytes`, `resolution`, `shot_index` |
| `photo_hq_requested` | HQ 모드 셔터 (기본 카메라 열림) | `dog_count` |
| `mic_permission` | 첫 녹화 마이크 요청 | `granted` |
| `video_record_started` | 녹화 시작 | `dog_count`, `mic` |
| `video_record_finished` | 녹화 저장 | `duration_ms`, `bytes`, `mime`, `dog_count`, `auto_stop` |
| `album_import_opened` / `album_imported` | 앨범 버튼 / 가져오기 완료 | `count`, `videos`, `dog_count` |
| `camera_closed` | ✕ | `shot_count`, `to_review` |
| `session_review_opened` | 촬영 검수 진입 | `items`, `unassigned`, `videos` |
| `session_assign_tab` | 배정 탭 | `unassigned` |
| `unassigned_fill_all` | 미지정 전부 → 강아지 | `count` |
| `session_review_saved` | 저장하고 폴더로 | `kept`, `deleted`, `assign_changes`, `unassigned_left`, `used_assign_tab` |
| `session_review_continue` | 계속 촬영 | `items` |
| `folder_opened` | 강아지/미지정 폴더 진입 | `kind`, `items`, `is_today` |
| `folder_select_mode` | 선택 모드 | |
| `viewer_opened` | 크게 보기 | `from`, `kind` |
| `editor_opened` | 편집 진입 | `kind` |
| `photo_edit_saved` | 사진 편집 저장 | `mode`, `rotation`, `aspect`, `zoom`, `brightness`, `moved` |
| `video_edit_saved` | 영상 편집 저장 | `mode`, `trimmed`, `mute`, `duration_ms`, `original_ms`, `bytes` |
| `video_frame_captured` | 장면 사진 저장 | `at_sec` |
| `media_assigned` | 강아지 배정 | `count`, `dogs`, `from` |
| `media_removed_from_folder` | 폴더에서 빼기 | `count` |
| `media_deleted` | 폴더 검수 삭제 | `count`, `where` |
| `folder_reviewed` | 검수 완료 토글 | `on`, `items` |
| `send_opened` | 보내기 진입 버튼 | `from`(folders_footer/folder) |
| `send_screen_viewed` | 보내기 화면 집계 | `pending_dogs`, `done_dogs` |
| `compress_toggled` | 압축 토글 | `kind`, `on` |
| `send_prepare_done` | 묶음 준비 완료 | `items`, `photos`, `videos`, `bytes`, `compress_photo`, `compress_video`, `ms` |
| `send_include_sent_toggled` | 보낸 것 포함 토글 | `on` |
| `send_attempted` | 공유 창 열기 | `items`, `bytes`, `batch_index`, `batches`, `include_sent`, `round` |
| `send_shared` / `send_cancelled` / `send_failed` / `send_unsupported` | 공유 결과 | `round`, `items` |
| `send_history_viewed` | 발송 이력 펼침 | `sends` |
| `settings_viewed` | 설정 진입 | `total_bytes`, `photo_count`, `video_count`, `quota_pct`, `dogs` |
| `purge_days_changed` | 자동 정리 기간 | `days` |
| `purge_now` | 지금 정리 | `count`, `freed_bytes` |
| `trash_emptied` | 삭제 기록 비우기 | `count` |
| `persist_requested` | 저장소 보호 요청 | `result` |
| `wipe_all` | 전체 초기화 | |

핵심 퍼널: `camera_opened → photo_captured → camera_closed(to_review) → session_review_saved → send_attempted → send_shared`.
가설 검증: `photo_captured.dog_count`(0이면 미지정 촬영)와 `session_review_saved.used_assign_tab` 비율로 "먼저 고르기" vs "나중에 붙이기".
