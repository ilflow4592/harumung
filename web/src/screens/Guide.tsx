import { type ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';
import { track } from '../lib/analytics';
import { isIOS } from '../lib/settings';

/**
 * 앱 안 사용 안내. 서비스 매뉴얼 톤의 정중체.
 * 설치·권한처럼 폰에 따라 다른 내용은 isIOS로 해당 폰 것만 보여준다.
 * 화면 그림은 public/guide/*.jpg (테스트 데이터로 찍은 실제 화면).
 */

/** 8컷 만화 대체 텍스트. 이미지 순서와 같다. */
const COMIC_ALT = [
  '원장이 놀이방에서 강아지들을 찍는다. "얘들아 여기 봐!"',
  '저녁, 폰 갤러리를 넘기며 "휴, 사진 다 찍었다… 근데 이거 언제 다 분류하고 보호자님들께 전송하지…"',
  '사진 더미를 보며 "사진이 미리 강아지별로 분류되어 있었으면 좋겠는데…"',
  '동료 원장이 "하루멍 한번 써보세요!"',
  '찍기 전 강아지 목록에서 보리를 탭해 체크한다. 목록엔 보리·콩이·몽이. "오늘은 먼저 선택하고!"',
  '아이별로 묶인 사진 옆 보내기 버튼. "이제 아이별로 묶어서 보내면 끝!"',
  '보호자가 카톡으로 받은 강아지 사진을 보며 "오늘도 감사해요". 원장은 옆에서 웃는다.',
  '하루멍 · 설치 없이 링크로 · 무료. "이제 더 많은 시간을 아이들과 함께하세요!"',
];
/** 각 컷의 높이(px, 너비 800 기준). 레이아웃 흔들림 방지. */
const COMIC_H = [508, 517, 492, 499, 499, 507, 494, 502];

const TOC = [
  ['start', '1. 처음 열었을 때'],
  ['dogs', '2. 강아지 등록 및 관리'],
  ['attendance', '3. 아침 등원 체크'],
  ['camera', '4. 사진 및 영상 촬영'],
  ['session', '5. 촬영 사진 검수 및 정리'],
  ['send', '6. 보호자에게 사진 보내기'],
  ['folder', '7. 강아지별 폴더 관리'],
  ['faq', '8. 자주 묻는 질문'],
  ['feedback', '9. 피드백 보내기'],
] as const;

/** 컷을 "봤다"고 치는 기준: 60% 이상 보이는 상태로 400ms 연속, 이미지 로드 완료, 탭이 보이는 상태. */
const COMIC_RATIO = 0.6;
const COMIC_DWELL_MS = 400;
/** 2컷→8컷이 이 시간보다 빠르면 읽지 않고 넘긴 것으로 표시. */
const COMIC_SKIM_SEC = 4;

/**
 * 만화 열람 이벤트 3종. 1컷은 안내를 열면 자동으로 보이므로 2컷부터 "읽기 시작"으로 센다.
 * - guide_comic_started: 2컷 통과
 * - guide_comic_viewed: 8컷 통과 (seconds, panels_seen, skimmed)
 * - guide_comic_abandoned: 시작했지만 8컷 전에 화면 이탈 (max_panel, seconds)
 */
function useComicViewTracking() {
  useEffect(() => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.guide__comic-strip img')];
    if (imgs.length === 0) return;
    const seen = new Set<number>();
    const timers = new Map<number, number>();
    let startedAt = 0;
    let done = false;
    const passed = (i: number) => {
      seen.add(i);
      if (i === 1 && !startedAt) { startedAt = Date.now(); track('guide_comic_started'); }
      if (i === imgs.length - 1 && !done) {
        done = true;
        const s = startedAt ? (Date.now() - startedAt) / 1000 : 0;
        track('guide_comic_viewed', { seconds: Math.round(s), panels_seen: seen.size, skimmed: s < COMIC_SKIM_SEC });
      }
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const img = e.target as HTMLImageElement;
        const i = imgs.indexOf(img);
        window.clearTimeout(timers.get(i));
        if (seen.has(i)) continue;
        const ok = e.isIntersecting && e.intersectionRatio >= COMIC_RATIO && img.complete && img.naturalWidth > 0 && document.visibilityState === 'visible';
        if (ok) timers.set(i, window.setTimeout(() => passed(i), COMIC_DWELL_MS));
      }
    }, { threshold: [COMIC_RATIO] });
    // 지연 로드 컷은 화면에 들어온 뒤 로드가 끝나도 observer가 다시 안 불린다. 로드 시점에 재관찰.
    const reobserve = (ev: Event) => { const img = ev.target as HTMLImageElement; io.unobserve(img); io.observe(img); };
    for (const img of imgs) { img.addEventListener('load', reobserve); io.observe(img); }
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      imgs.forEach((img) => img.removeEventListener('load', reobserve));
      if (startedAt && !done) track('guide_comic_abandoned', { max_panel: Math.max(...seen) + 1, seconds: Math.round((Date.now() - startedAt) / 1000) });
    };
  }, []);
}

export function GuideScreen() {
  const navigate = useNavigate();
  useComicViewTracking();
  return (
    <div className="screen">
      <TopBar title="사용 안내" onBack={() => navigate(-1)} />
      <main className="body guide" style={{ paddingBottom: 60 }}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 8px' }}>
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="하루멍 로고" width={120} height={120} />
        </div>
        <p><b>하루멍은 강아지별 사진 촬영부터 보호자 전달까지, 애견유치원의 일상적인 사진 관리를 간편하게 도와주는 서비스입니다.</b></p>
        <p>촬영 전에 강아지를 선택하면 사진이 해당 강아지의 폴더에 자동으로 저장됩니다. 촬영한 사진은 필요한 항목만 정리한 뒤 카카오톡으로 보호자에게 전달할 수 있습니다.</p>
        <p>하루멍에 저장되는 사진과 영상은 외부 서버에 업로드되지 않으며, 사용 중인 기기에만 보관됩니다.</p>

        <section className="guide__comic" aria-label="8컷으로 보는 하루멍">
          <h3>🐾 8컷으로 보는 하루멍</h3>
          <p>사진 촬영부터 아이별 정리와 전송까지, 원장님의 저녁이 어떻게 달라지는지 1분 만에 확인해 보세요.</p>
          <div className="guide__comic-strip">
            {COMIC_ALT.map((alt, i) => (
              <img key={alt} src={`${import.meta.env.BASE_URL}guide/comic/${String(i + 1).padStart(2, '0')}.webp`} alt={`${i + 1}컷. ${alt}`} loading={i < 2 ? 'eager' : 'lazy'} width={800} height={COMIC_H[i]} />
            ))}
          </div>
          <p className="sub">아래 안내는 이 흐름을 화면별로 설명합니다. 찍기 전 강아지 선택 → 검수 → 보내기, 세 단계입니다.</p>
        </section>

        <h3>하루멍 사용 흐름</h3>
        <ol>
          <li><b>등원 체크:</b> 오늘 등원한 강아지를 선택합니다.</li>
          <li><b>사진 촬영:</b> 촬영할 강아지를 선택하고 사진이나 영상을 촬영합니다.</li>
          <li><b>사진 정리:</b> 촬영한 사진을 확인하고 불필요한 사진을 삭제합니다.</li>
          <li><b>보호자 전달:</b> 아직 전달하지 않은 사진을 카카오톡으로 공유합니다.</li>
          <li><b>사진 관리:</b> 강아지별 폴더에서 촬영 및 전달 이력을 확인합니다.</li>
        </ol>

        <h3>목차</h3>
        <nav className="guide__toc">
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => track('guide_section_jumped', { section: id })}>{label}</a>)}
        </nav>

        <Section id="start" title="1. 처음 열었을 때">
          <p>하루멍을 안정적으로 사용하려면 먼저 홈 화면에 추가해 주세요. 브라우저에서 직접 실행하는 것보다 홈 화면에 추가하여 사용하는 것을 권장합니다.</p>
          {isIOS ? (
            <>
              <h3>아이폰 (Safari)</h3>
              <ol>
                <li>Safari 하단의 공유 버튼(네모와 위쪽 화살표)을 선택합니다.</li>
                <li><b>홈 화면에 추가</b>를 선택합니다.</li>
                <li>오른쪽 상단의 <b>추가</b> 버튼을 누릅니다.</li>
                <li>홈 화면에 생성된 노란색 하루멍 아이콘을 선택해 실행합니다.</li>
              </ol>
              <p className="guide__note"><b>중요:</b> Safari에서 먼저 등록한 강아지 정보는 홈 화면에 추가한 하루멍과 별도로 저장됩니다. 반드시 홈 화면에 추가한 뒤 해당 아이콘으로 실행하여 강아지를 등록해 주세요.</p>
              <p>브라우저 탭으로 장기간 사용하지 않으면 iOS가 저장 공간 확보를 위해 웹사이트 데이터를 정리할 수 있으므로 홈 화면 실행을 권장합니다.</p>
            </>
          ) : (
            <>
              <h3>안드로이드 (Chrome)</h3>
              <ol>
                <li>Chrome 오른쪽 상단의 더보기(점 세 개)를 선택합니다.</li>
                <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 선택합니다.</li>
                <li>홈 화면에 생성된 노란색 하루멍 아이콘을 선택해 실행합니다.</li>
              </ol>
              <p>추가로 설정 메뉴에서 <b>보호 요청</b> 기능을 활성화해 주세요. 기기의 저장 공간이 부족할 때 Chrome이 하루멍의 데이터를 임의로 정리하는 것을 방지하는 데 도움이 됩니다.</p>
            </>
          )}

          <h3>메인 화면 구성</h3>
          <p>하루멍을 실행하면 오늘 날짜의 폴더가 표시됩니다.</p>
          <ul>
            <li><b>강아지 목록:</b> 등록된 강아지와 각 강아지의 사진 폴더를 확인합니다.</li>
            <li><b>촬영 시작:</b> 카메라를 실행하여 사진과 영상을 촬영합니다.</li>
            <li><b>보내기:</b> 보호자에게 전달하지 않은 사진이 있다면 표시됩니다.</li>
            <li><b>설정(톱니바퀴):</b> 앱 설정 및 사용 가이드를 확인할 수 있습니다.</li>
          </ul>
          <Shot src="01-folders" alt="오늘 폴더 화면" />
        </Section>

        <Section id="dogs" title="2. 강아지 등록 및 관리">
          <p>하루멍을 처음 사용하는 경우 강아지 정보를 등록해야 합니다. 등록된 강아지는 촬영 화면에서 선택할 수 있으며, 촬영한 사진과 영상은 해당 강아지의 폴더에 저장됩니다.</p>
          <h3>강아지 등록하기</h3>
          <ul>
            <li>등록된 강아지가 없는 경우 메인 화면의 <b>강아지 등록</b> 버튼을 선택합니다.</li>
            <li>이미 등록된 강아지가 있다면 오른쪽 상단의 <b>강아지</b> 버튼을 선택한 뒤 <b>+</b> 버튼을 누릅니다.</li>
          </ul>
          <p>다음 정보를 입력해 주세요.</p>
          <ul>
            <li>강아지 이름</li>
            <li>성별</li>
            <li>보호자 연락처 (선택)</li>
            <li>정면 사진 (선택)</li>
          </ul>
          <p>보호자 연락처는 보내기 화면에서 누구에게 보낼지 확인하는 용도로만 쓰이며, 입력하지 않아도 됩니다. 정면 사진도 필수 항목이 아닙니다. 다만 사진을 등록하면 촬영 화면에서 강아지의 얼굴을 확인하며 선택할 수 있어 여러 마리를 관리할 때 편리합니다.</p>
          <Shot src="04-dog-new" alt="강아지 등록 화면" />
          <h3>퇴원한 강아지 관리하기</h3>
          <p>졸업하거나 퇴원한 강아지는 강아지 관리 화면에서 해당 강아지를 선택한 뒤 <b>정보 수정 · 퇴원</b> 메뉴의 <b>퇴원 처리</b>로 정리할 수 있습니다.</p>
          <p>퇴원 처리된 강아지는 기본 목록에서 제외되지만, 기존 사진과 영상은 그대로 유지됩니다.</p>
          <p>퇴원한 강아지는 <b>강아지 관리 → 퇴원한 아이 보기</b>에서 확인할 수 있으며, 필요한 경우 다시 등록 상태로 변경할 수 있습니다.</p>
        </Section>

        <Section id="attendance" title="3. 아침 등원 체크">
          <p>등원 체크 기능을 사용하면 당일 등원한 강아지만 촬영 화면에 표시할 수 있습니다.</p>
          <ol>
            <li>메인 화면에서 <b>오늘 등원 체크하기</b>를 선택합니다.</li>
            <li>당일 등원한 강아지를 선택합니다.</li>
            <li>선택을 완료하면 해당 강아지들만 촬영 화면에 표시됩니다.</li>
          </ol>
          <Shot src="02-attendance" alt="등원 체크 화면" />
          <p>등록된 강아지가 많을수록 촬영 대상을 빠르게 찾을 수 있어 편리합니다.</p>
          <h3>등원 체크 수정하기</h3>
          <p>등원 체크를 완료한 후 늦게 도착한 강아지가 있다면 <b>수정</b> 버튼을 눌러 추가할 수 있습니다.</p>
          <p>등원 체크를 진행하지 않아도 촬영 기능은 정상적으로 사용할 수 있습니다. 이 경우 등록된 전체 강아지가 촬영 화면에 표시됩니다.</p>
          <p className="guide__note"><b>참고:</b> 등원 체크는 날짜별로 관리됩니다. 이전 날짜의 등원 정보가 다음 날 자동으로 유지되지는 않습니다.</p>
        </Section>

        <Section id="camera" title="4. 사진 및 영상 촬영">
          <p>카메라 화면 하단에는 촬영할 수 있는 강아지 목록이 표시됩니다.</p>
          <h3>사진 촬영하기</h3>
          <ol>
            <li>촬영할 강아지를 선택합니다.</li>
            <li>카메라 구도를 확인합니다.</li>
            <li>셔터 버튼을 눌러 촬영합니다.</li>
          </ol>
          <p>촬영한 사진은 선택한 강아지의 폴더에 자동으로 저장됩니다.</p>
          <p>여러 강아지가 함께 있는 사진이라면 해당 강아지들을 모두 선택해 주세요. 한 장의 사진이 선택한 모든 강아지의 폴더에 저장됩니다.</p>
          <Shot src="06-camera-shots" alt="카메라 화면" />
          <p>촬영이 완료되면 화면이 한 번 깜빡이고 하단에 미리보기 썸네일이 표시됩니다.</p>
          {isIOS ? <p>무음 모드에서는 촬영음이 재생되지 않을 수 있습니다. 이때는 화면의 깜빡임과 썸네일을 통해 촬영 여부를 확인해 주세요.</p> : null}
          <h3>영상 촬영하기</h3>
          <p>카메라 상단에서 <b>영상</b> 모드로 전환하면 셔터 버튼이 빨간색으로 변경됩니다.</p>
          <ul>
            <li>한 번 누르면 영상 촬영이 시작됩니다.</li>
            <li>최대 30초까지 촬영할 수 있습니다.</li>
            <li>촬영 중 셔터 버튼을 다시 누르면 촬영이 종료됩니다.</li>
          </ul>
          <h3>강아지를 선택하지 않고 촬영하기</h3>
          <p>촬영 순간 강아지를 선택할 시간이 부족하다면 먼저 촬영을 진행해도 괜찮습니다.</p>
          <p>강아지를 지정하지 않은 사진과 영상은 <b>미지정</b> 상태로 저장되며, 촬영 후 배정 메뉴에서 해당 강아지에게 연결할 수 있습니다.</p>
          <h3>기존 사진 가져오기</h3>
          <p>카메라 화면 오른쪽 하단의 가져오기 버튼을 선택하면 기본 카메라 등으로 촬영한 사진도 하루멍에 추가할 수 있습니다.</p>
        </Section>

        <Section id="session" title="5. 촬영 사진 검수 및 정리">
          <p>촬영을 마쳤다면 사진을 검수하고 불필요한 항목을 정리할 수 있습니다.</p>
          <h3>촬영한 사진 검수하기</h3>
          <ol>
            <li>카메라 화면에서 <b>✕</b> 버튼을 눌러 나갑니다.</li>
            <li>방금 촬영한 사진이 강아지별로 표시됩니다.</li>
            <li>삭제할 사진을 선택합니다.</li>
            <li><b>저장하고 폴더로</b> 버튼을 눌러 완료합니다.</li>
          </ol>
          <Shot src="08-session-review" alt="촬영 검수 화면" />
          <p><b>삭제할 사진만 선택해 주세요.</b> 선택하지 않은 사진은 정상적으로 강아지 폴더에 저장됩니다.</p>
          <p>흔들린 사진이나 눈을 감은 사진 등 불필요한 항목만 빠르게 골라낼 수 있습니다.</p>
          <h3>미지정 사진 배정하기</h3>
          <p>강아지를 선택하지 않고 촬영한 사진은 배정 메뉴에서 관리할 수 있습니다.</p>
          <ol>
            <li><b>배정</b> 탭에 표시된 숫자를 확인합니다.</li>
            <li>사진을 배정할 강아지를 선택합니다.</li>
            <li>해당 강아지에게 연결할 사진을 선택합니다.</li>
          </ol>
          <p>배정을 마친 뒤 <b>저장하고 폴더로</b> 버튼을 누르면 사진이 해당 강아지의 폴더에 연결됩니다.</p>
          <Shot src="09-session-assign" alt="배정 탭" />
        </Section>

        <Section id="send" title="6. 보호자에게 사진 보내기">
          <p>하루멍에서는 강아지별로 촬영한 사진을 모아 카카오톡으로 전달할 수 있습니다.</p>
          <h3>사진 보내기</h3>
          <ol>
            <li>메인 화면 하단의 <b>보내기</b> 버튼을 선택합니다.</li>
            <li>사진을 전달할 강아지의 카드를 확인합니다.</li>
            <li><b>보호자에게 보내기</b>를 선택합니다.</li>
            <li>기기의 공유 창에서 카카오톡을 선택합니다.</li>
            <li>해당 보호자와의 채팅방을 선택한 뒤 전송합니다.</li>
          </ol>
          <Shot src="18-send" alt="보내기 화면" />
          <p>기존에 사용하던 카카오톡 공유 방식과 동일하게 전달할 수 있습니다.</p>
          <h3>미전송 사진만 전송됩니다</h3>
          <p>하루멍은 아직 보호자에게 전달하지 않은 사진만 구분하여 묶어줍니다.</p>
          <p>예를 들어 점심시간에 사진을 한 번 전달한 뒤 오후에 새로운 사진을 촬영했다면, 저녁에는 오후에 촬영한 사진만 전송 대상으로 표시됩니다.</p>
          <p>이미 전달한 사진이 중복으로 포함되지 않도록 관리할 수 있습니다.</p>
          <p className="guide__note"><b>전송 완료 처리 안내</b><br />카카오톡에서 실제 전송을 완료해야 하루멍에 전송 이력이 기록됩니다. 공유 창을 열었다가 전송하지 않고 닫으면 전송 완료로 기록되지 않으며, 해당 사진은 다음에도 전송 대상으로 표시됩니다.</p>
          <h3>사진 및 영상 압축 설정</h3>
          <ul>
            <li><b>사진 압축:</b> 활성화를 권장합니다. 화면에서 확인하는 품질 차이는 크지 않으면서 전송 용량과 시간을 줄일 수 있습니다.</li>
            <li><b>영상 압축:</b> 영상 길이에 따라 처리 시간이 발생합니다. Wi-Fi 환경에서 원본 전송이 가능한 경우에는 비활성화해도 됩니다.</li>
          </ul>
          <p>사진이 많은 경우 전송 용량에 따라 여러 묶음으로 나뉠 수 있습니다. 이때는 첫 번째 묶음과 두 번째 묶음을 순서대로 전송해 주세요.</p>
        </Section>

        <Section id="folder" title="7. 강아지별 폴더 관리">
          <p>메인 화면에서 강아지를 선택한 뒤 <b>사진 폴더 검수</b>를 누르면 해당 강아지에게 연결된 사진과 영상을 확인할 수 있습니다.</p>
          <h3>사진 및 영상 확인하기</h3>
          <ol>
            <li>메인 화면에서 확인할 강아지를 선택합니다.</li>
            <li>메뉴에서 <b>사진 폴더 검수</b>를 선택합니다.</li>
            <li>해당 강아지의 사진과 영상 목록을 확인합니다.</li>
            <li>원하는 항목을 선택하면 크게 볼 수 있습니다.</li>
          </ol>
          <p>사진을 선택한 후 오른쪽 상단의 <b>편집</b> 메뉴에서 다음 작업을 할 수 있습니다.</p>
          <ul>
            <li>사진 자르기</li>
            <li>사진 회전</li>
            <li>밝기 조절</li>
          </ul>
          <p>영상은 앞부분과 뒷부분을 잘라 필요한 구간만 남길 수 있습니다.</p>
          <Shot src="11-folder-review" alt="강아지 폴더 화면" />
          <h3>사진의 강아지 배정 변경하기</h3>
          <p>다른 강아지의 폴더에 잘못 저장된 사진은 이동할 수 있습니다.</p>
          <ol>
            <li>사진 목록 오른쪽 상단의 <b>선택</b> 버튼을 누릅니다.</li>
            <li>이동할 사진을 선택합니다.</li>
            <li><b>옮기기·추가</b>에서 이동할 강아지를 지정합니다.</li>
          </ol>
          <h3>이전 날짜 사진 확인하기</h3>
          <p>날짜 옆의 화살표를 선택하면 이전 날짜의 폴더로 이동할 수 있습니다.</p>
          <p>사진의 전송 여부도 함께 확인할 수 있습니다. 보호자에게 전달된 사진에는 <b>1회 보냄</b> 표시가 나타납니다.</p>
        </Section>

        <Section id="faq" title="8. 자주 묻는 질문">
          <h3>카메라가 실행되지 않아요.</h3>
          <p>기기의 설정에서 브라우저 카메라 접근 권한이 허용되어 있는지 확인해 주세요.</p>
          <p>{isIOS ? '설정 → Safari → 카메라' : '설정 → 앱 → Chrome → 권한 → 카메라'}</p>
          <p>권한이 차단되어 있다면 허용으로 변경한 뒤 다시 실행해 주세요.</p>
          <h3>등원 체크한 강아지가 촬영 화면에 보이지 않아요.</h3>
          <p>등원 체크는 날짜별로 관리됩니다. 오늘 날짜의 등원 체크가 정상적으로 완료되었는지 확인해 주세요.</p>
          <h3>보내기를 눌렀는데 공유 창이 열리지 않아요.</h3>
          <p>화면에 빨간색 오류 안내가 표시되는지 확인해 주세요.</p>
          <p>오류 안내가 있다면 해당 내용을 복사하거나 캡처하여 설정의 <b>피드백 보내기</b>로 전달해 주세요.</p>
          <h3>휴대폰 저장 공간이 부족해요.</h3>
          <p>설정에서 <b>보낸 사진 원본 자동 정리</b> 기능을 사용할 수 있습니다.</p>
          <p>이 기능을 활성화하면 이미 전송한 사진 중 보관 기간이 지난 항목의 원본을 정리하고, 작은 미리보기 이미지만 남깁니다.</p>
          <p>아직 보호자에게 전송하지 않은 사진은 자동 정리 대상에 포함되지 않습니다.</p>
          <h3>휴대폰을 변경하면 사진도 함께 이동하나요?</h3>
          <p>아니요. 하루멍의 사진과 영상은 현재 사용 중인 기기에만 저장됩니다.</p>
          <p>외부 서버에 업로드하거나 별도로 백업하지 않으므로 기기를 변경하면 기존 사진과 영상이 자동으로 이전되지 않습니다.</p>
          <p>기기 변경 전에 필요한 사진과 영상을 별도로 보관해 주세요.</p>
          <h3>삭제한 사진을 복구할 수 있나요?</h3>
          <p>아니요. 삭제한 사진과 영상은 복구할 수 없습니다.</p>
          <p>삭제하기 전에 필요한 항목인지 다시 한번 확인해 주세요. 확실하지 않은 경우에는 삭제하지 않는 것을 권장합니다.</p>
        </Section>

        <Section id="feedback" title="9. 피드백 보내기">
          <p>하루멍을 사용하면서 오류가 발생하거나 개선이 필요한 부분을 발견했다면 설정 메뉴의 <b>피드백 보내기</b>를 이용해 주세요.</p>
          <p>보다 정확하고 빠르게 확인할 수 있도록 다음 내용을 함께 전달해 주시면 좋습니다.</p>
          <ul>
            <li>문제가 발생한 화면</li>
            <li>수행한 작업 및 발생한 상황</li>
            <li>화면에 표시된 오류 메시지</li>
            <li>관련 화면 캡처</li>
          </ul>
          <Shot src="27-feedback" alt="피드백 보내기 화면" />
          <p>전달해 주신 내용은 문제 확인과 서비스 개선에 활용됩니다.</p>
          <p>하루멍을 더 편리하게 사용할 수 있도록 지속적으로 개선하겠습니다.</p>
        </Section>

        <p className="guide__outro">하루멍과 함께 아이들의 소중한 하루를 기록해 보세요.</p>

        <a href="#top" className="btn btn--ghost" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>맨 위로</a>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="guide__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="guide__shot">
      <img src={`${import.meta.env.BASE_URL}guide/${src}.jpg`} alt={alt} loading="lazy" />
      <figcaption>{alt}</figcaption>
    </figure>
  );
}
