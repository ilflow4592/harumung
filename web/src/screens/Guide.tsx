import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';
import { track } from '../lib/analytics';

/**
 * 앱 안 사용 안내. 원장·선생님이 읽는 글이라 존댓말.
 * 꼭 알아야 하는 것만 남긴다. 세부 기능은 화면 안 문구가 설명한다.
 * 화면 그림은 public/guide/*.jpg (테스트 데이터로 찍은 실제 화면).
 */

const TOC = [
  ['start', '1. 시작하기'],
  ['dogs', '2. 강아지 등록'],
  ['attendance', '3. 등원 체크'],
  ['camera', '4. 촬영'],
  ['session', '5. 촬영 검수'],
  ['send', '6. 보호자에게 보내기'],
  ['folder', '7. 폴더와 편집'],
  ['faq', '8. 안 될 때'],
  ['feedback', '9. 피드백 보내기'],
] as const;

export function GuideScreen() {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <TopBar title="사용 안내" onBack={() => navigate(-1)} />
      <main className="body guide" style={{ paddingBottom: 60 }}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 8px' }}>
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="하루멍 로고" width={120} height={120} />
        </div>
        <p className="guide__lead">
          찍기 전에 강아지를 고르면 사진이 그 아이 폴더로 들어가고, 하원 때 카톡으로 바로 보냅니다.
          사진은 이 폰 안에만 저장됩니다.
        </p>
        <Table head={['순서', '할 일', '언제']} rows={[
          ['1', '등원 체크', '아침에 한 번'],
          ['2', '촬영', '하루 종일'],
          ['3', '촬영 검수', '카메라를 닫을 때'],
          ['4', '보호자에게 보내기', '보내고 싶을 때'],
        ]} />
        <nav className="guide__toc">
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => track('guide_section_jumped', { section: id })}>{label}</a>)}
        </nav>

        <Section id="start" title="1. 시작하기">
          <p><b>홈 화면에 설치하고, 그 아이콘으로 여세요.</b> 브라우저 탭으로만 쓰면 아이폰이 7일 동안 안 열었을 때 사진을 지울 수 있습니다.</p>
          <Table head={['폰', '설치 방법']} rows={[
            ['아이폰', <>사파리 아래 공유 버튼(네모에 화살표) → <b>홈 화면에 추가</b> → <b>추가</b></>],
            ['안드로이드', <>크롬 오른쪽 위 ⋮ → <b>홈 화면에 추가</b></>],
          ]} />
          <p>아이폰은 사파리와 홈 화면 앱의 저장소가 따로입니다. 강아지 등록은 설치한 뒤 앱 아이콘으로 열어서 하세요.</p>
          <p>첫 화면은 <b>오늘 폴더</b>입니다. 강아지 목록과 아래 <b>촬영 시작</b>, 안 보낸 사진이 있으면 <b>보내기</b> 버튼이 있습니다. 오른쪽 위 ⚙이 설정이고, 이 안내와 피드백 보내기도 그 안에 있습니다.</p>
          <Shot src="01-folders" alt="오늘 폴더 화면" />
        </Section>

        <Section id="dogs" title="2. 강아지 등록">
          <p>처음 한 번만 합니다. 첫 화면의 <b>강아지 등록</b>, 그 뒤로는 오른쪽 위 <b>강아지</b> → <b>+</b>.</p>
          <p>이름, 성별, 보호자 연락처는 필수입니다. 정면 사진을 넣으면 카메라에서 얼굴로 고를 수 있습니다.</p>
          <Shot src="04-dog-new" alt="강아지 등록 화면" />
          <p>강아지를 탭하면 <b>정보 수정 · 퇴원</b>이 나옵니다. 퇴원해도 사진은 남고, 강아지 관리 맨 아래 <b>퇴원한 아이 보기</b>에서 복원됩니다.</p>
        </Section>

        <Section id="attendance" title="3. 등원 체크">
          <p>아침에 <b>오늘 등원 체크하기</b>를 누르고 온 아이만 탭하세요. 그날 카메라와 폴더에 그 아이들만 보입니다. 늦게 온 아이는 <b>수정</b>으로 추가하면 됩니다.</p>
          <Shot src="02-attendance" alt="등원 체크 화면" />
        </Section>

        <Section id="camera" title="4. 촬영">
          <p><b>아래 강아지 줄에서 누구를 찍는지 탭하고 셔터를 누르세요.</b> 그 사진은 그 아이 폴더로 바로 들어갑니다. 두 마리를 탭하면 둘 다에게 들어갑니다.</p>
          <Shot src="06-camera-shots" alt="카메라 화면. 아래 강아지 줄에서 고른 아이로 찍은 사진이 붙는다" />
          <ul>
            <li>찍히면 화면이 번쩍이고 아래 사진 줄에 썸네일이 붙습니다.</li>
            <li>위 가운데에서 <b>영상</b>으로 바꾸면 셔터가 빨간색이 되고, 30초까지 녹화됩니다.</li>
            <li>강아지를 고를 틈이 없으면 그냥 찍으세요. <b>미지정</b>으로 저장되고, 다음 단계에서 붙입니다.</li>
            <li>아래 오른쪽 버튼으로 기본 카메라로 찍어 둔 사진도 가져올 수 있습니다.</li>
          </ul>
        </Section>

        <Section id="session" title="5. 촬영 검수">
          <p>카메라에서 ✕를 누르면 방금 찍은 사진이 강아지별로 모입니다. <b>지울 사진만 탭하고 저장</b>하면 나머지는 폴더에 들어갑니다.</p>
          <Shot src="08-session-review" alt="촬영 검수. 지울 사진에 빨간 ✕" />
          <p>미지정 사진이 있으면 <b>배정</b> 탭에 숫자가 뜹니다. 위에서 강아지를 고르고 사진을 탭하면 붙습니다.</p>
          <Shot src="09-session-assign" alt="배정 탭. 강아지를 고르고 사진을 탭" />
        </Section>

        <Section id="send" title="6. 보호자에게 보내기">
          <p>오늘 폴더 아래 <b>보내기</b>. 안 보낸 사진만 묶이므로 오전·오후로 나눠 보내도 같은 사진이 두 번 가지 않습니다.</p>
          <ol>
            <li>아이 카드의 <b>보호자에게 보내기</b>를 누릅니다.</li>
            <li>폰 공유 창에서 <b>카카오톡</b> → 보호자 채팅방 → 전송.</li>
            <li>전송을 마치면 발송 기록이 남습니다. 공유 창을 그냥 닫으면 기록되지 않습니다.</li>
          </ol>
          <Shot src="18-send" alt="보내기 화면. 미발송 사진이 있는 아이만 카드로" />
          <p>위 <b>사진 압축</b>은 켜 두세요. 전송이 빨라지고 폰 화면으로 보기엔 차이가 없습니다. 영상 압축은 영상 길이만큼 시간이 걸리니 필요할 때만 켜세요.</p>
          <p>사진이 많으면 묶음이 나뉩니다. <b>1묶음</b>, <b>2묶음</b>을 차례로 보내면 됩니다.</p>
        </Section>

        <Section id="folder" title="7. 폴더와 편집">
          <p>오늘 폴더에서 강아지를 탭하면 그 아이 사진이 모여 있습니다. 사진을 탭하면 크게 보이고, 오른쪽 위 <b>편집</b>으로 자르기·회전·밝기, 영상은 구간 자르기를 할 수 있습니다.</p>
          <Shot src="11-folder-review" alt="강아지 폴더. 보낸 사진엔 1회 보냄 표시" />
          <p>오른쪽 위 <b>선택</b>으로 여러 장을 골라 다른 아이에게 옮기거나 삭제합니다. 날짜 줄의 ‹ ›로 지난 날 사진도 볼 수 있습니다.</p>
        </Section>

        <Section id="faq" title="8. 안 될 때">
          <p><b>사진은 이 폰 안에만 있습니다.</b> 폰을 바꾸면 사진이 따라가지 않습니다. <b>삭제는 되돌릴 수 없습니다.</b></p>
          <Table head={['증상', '해결']} rows={[
            ['카메라가 안 열려요', '폰 설정 → 사파리(또는 크롬) → 카메라 허용'],
            ['찰칵 소리가 안 나요', '아이폰 무음 스위치. 화면 번쩍임으로 확인하세요'],
            ['등원 체크한 아이가 카메라에 없어요', '등원 체크는 날짜별이라 매일 아침 다시 합니다'],
            ['보내기를 눌러도 공유 창이 안 떠요', '버튼 아래 빨간 상자의 내용을 피드백으로 보내 주세요'],
            ['폰 용량이 부족해요', '설정 → 보낸 사진 원본 자동 정리. 보낸 사진만 기간이 지나면 원본을 지웁니다'],
          ]} />
        </Section>

        <Section id="feedback" title="9. 피드백 보내기">
          <p>⚙ 설정 → <b>피드백 보내기</b>. 어느 화면에서 무엇을 했더니 어떻게 됐는지 적고, 화면 캡처를 붙이면 바로 고칩니다.</p>
          <Shot src="27-feedback" alt="피드백 보내기 화면" />
        </Section>

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

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="guide__tablewrap">
      <table className="guide__table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
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
