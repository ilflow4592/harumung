import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';
import { track } from '../lib/analytics';
import { isIOS } from '../lib/settings';

/**
 * 앱 안 사용 안내. 원장님께 옆에서 설명하는 말투. 자기소개 없음.
 * 꼭 알아야 하는 것만 남긴다. 세부 기능은 화면 안 문구가 설명한다.
 * 화면 그림은 public/guide/*.jpg (테스트 데이터로 찍은 실제 화면).
 */

const TOC = [
  ['start', '처음 열었을 때'],
  ['dogs', '강아지 등록'],
  ['attendance', '아침 등원 체크'],
  ['camera', '사진 찍기'],
  ['session', '찍고 나서 정리'],
  ['send', '보호자에게 보내기'],
  ['folder', '폴더에서 다시 보기'],
  ['faq', '이럴 땐 이렇게'],
  ['feedback', '불편한 점 알려주기'],
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
          하루멍이 하는 일은 하나예요. 찍기 전에 강아지를 고르면 사진이 그 아이 폴더로 들어가고, 하원 때 카톡으로 보내는 것.
          사진은 전부 이 폰 안에만 있고 어디로도 올라가지 않아요.
        </p>
        <p>하루 흐름은 이래요. 아침에 온 아이들 체크하고, 종일 찍고, 카메라 닫을 때 지울 사진만 골라내고, 보내고 싶을 때 보내면 끝이에요.</p>
        <nav className="guide__toc">
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => track('guide_section_jumped', { section: id })}>{label}</a>)}
        </nav>

        <Section id="start" title="처음 열었을 때">
          {isIOS ? (
            <>
              <p>먼저 홈 화면에 추가해 주세요. 이게 제일 중요해요. 사파리 탭으로만 쓰면 일주일쯤 안 열었을 때 아이폰이 사진을 지워버릴 수 있거든요.</p>
              <p>사파리 맨 아래 공유 버튼(네모에 화살표)을 누르고 → <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>. 홈 화면에 노란 강아지 아이콘이 생겨요.</p>
              <p>한 가지 더요. 사파리에서 넣은 강아지는 홈 화면 앱으로 안 넘어와요. 저장소가 따로라서 그래요. 그러니까 설치 먼저 하고, 홈 화면 아이콘으로 열어서 강아지를 등록해 주세요.</p>
            </>
          ) : (
            <>
              <p>먼저 홈 화면에 추가해 주세요. 크롬 오른쪽 위 점 세 개 → <b>홈 화면에 추가</b>(또는 <b>앱 설치</b>). 홈 화면에 노란 강아지 아이콘이 생기고, 앱처럼 열려요.</p>
              <p>설정에 <b>보호 요청</b> 버튼이 있는데, 한 번 눌러두면 폰 용량이 부족할 때 크롬이 사진을 임의로 지우지 않아요.</p>
            </>
          )}
          <p>열면 <b>오늘 폴더</b>가 보여요. 강아지 목록이 있고, 맨 아래에 <b>촬영 시작</b> 버튼이 있어요. 안 보낸 사진이 생기면 그 옆에 <b>보내기</b> 버튼이 하나 더 생겨요. 오른쪽 위 톱니바퀴가 설정이고, 이 안내도 거기 있어요.</p>
          <Shot src="01-folders" alt="오늘 폴더 화면" />
        </Section>

        <Section id="dogs" title="강아지 등록">
          <p>처음 한 번만 하면 돼요. 아무도 없을 땐 화면 가운데 <b>강아지 등록</b> 버튼이 있고, 그 뒤로는 오른쪽 위 <b>강아지</b> 버튼 누르고 <b>+</b>예요.</p>
          <p>이름, 성별, 보호자 연락처는 꼭 넣어 주세요. 정면 사진은 안 넣어도 되는데, 넣어두면 카메라에서 얼굴 보고 고를 수 있어서 편해요.</p>
          <Shot src="04-dog-new" alt="강아지 등록 화면" />
          <p>졸업하거나 그만둔 아이는 강아지를 탭해서 <b>퇴원</b> 처리하면 목록에서 빠져요. 사진은 그대로 남고, 강아지 관리 맨 아래 <b>퇴원한 아이 보기</b>에서 언제든 되돌릴 수 있어요.</p>
        </Section>

        <Section id="attendance" title="아침 등원 체크">
          <p>아이들이 다 오면 <b>오늘 등원 체크하기</b> 눌러서 온 아이만 탭해 주세요. 그러면 그날은 카메라에 그 아이들만 떠요. 스무 마리 중에 여덟 마리 왔는데 스무 마리 다 보이면 고르기 번거롭잖아요.</p>
          <Shot src="02-attendance" alt="등원 체크 화면" />
          <p>늦게 온 아이는 <b>수정</b> 눌러서 추가하면 되고, 깜빡하고 안 해도 괜찮아요. 그냥 전체가 보일 뿐이에요.</p>
        </Section>

        <Section id="camera" title="사진 찍기">
          <p>카메라 아래쪽에 강아지들이 줄지어 있어요. <b>찍을 아이를 탭하고 셔터를 누르세요.</b> 그게 다예요. 사진이 바로 그 아이 폴더로 들어가요. 두 마리가 같이 놀고 있으면 둘 다 탭하면 둘 다한테 들어가요.</p>
          <Shot src="06-camera-shots" alt="카메라 화면. 아래 강아지 줄에서 고른 아이로 찍은 사진이 붙는다" />
          <p>찍히면 화면이 한 번 번쩍하고 아래에 작은 썸네일이 붙어요.{isIOS ? ' 무음 모드면 찰칵 소리는 안 나니까 번쩍이는 걸로 확인하세요.' : ''}</p>
          <p>영상은 위에 <b>영상</b>을 누르면 셔터가 빨갛게 바뀌어요. 30초까지 찍히고, 중간에 셔터를 다시 누르면 거기서 끝나요.</p>
          <p>아이들이 갑자기 뭔가 귀여운 짓을 하는데 고를 틈이 없다, 그럴 땐 그냥 찍으세요. <b>미지정</b>으로 저장됐다가 나중에 붙이면 돼요. 아래 오른쪽 버튼으로는 기본 카메라로 찍어둔 사진도 가져올 수 있어요.</p>
        </Section>

        <Section id="session" title="찍고 나서 정리">
          <p>카메라에서 ✕를 누르면 방금 찍은 사진이 강아지별로 쭉 나와요. 여기서 <b>지울 사진만 탭하고 저장</b>하세요. 탭 안 한 건 다 폴더로 들어가요. 흔들린 거, 눈 감은 거 골라내는 데 보통 30초면 돼요.</p>
          <Shot src="08-session-review" alt="촬영 검수. 지울 사진에 빨간 ✕" />
          <p>아까 강아지 안 고르고 찍은 사진이 있으면 <b>배정</b> 탭에 숫자가 떠요. 위에서 강아지 고르고 사진 탭하면 붙어요.</p>
          <Shot src="09-session-assign" alt="배정 탭. 강아지를 고르고 사진을 탭" />
        </Section>

        <Section id="send" title="보호자에게 보내기">
          <p>오늘 폴더 아래 <b>보내기</b> 버튼이에요. 아이마다 카드가 뜨는데, <b>보호자에게 보내기</b>를 누르면 폰 공유 창이 열려요. 거기서 카카오톡 고르고, 보호자 채팅방 고르고, 전송. 평소 카톡으로 사진 보내던 그 화면이에요.</p>
          <Shot src="18-send" alt="보내기 화면. 미발송 사진이 있는 아이만 카드로" />
          <p>한 가지만 기억하세요. <b>안 보낸 사진만 묶여요.</b> 점심때 한 번 보내고 오후에 더 찍었으면, 저녁엔 오후 사진만 나가요. 같은 사진이 두 번 가는 일은 없어요.</p>
          <p>전송을 끝까지 해야 "보냈다"로 기록돼요. 공유 창을 그냥 닫으면 기록이 안 남아서 다음에 또 묶여요.</p>
          <p>위에 <b>사진 압축</b>은 켜 두세요. 폰으로 보기엔 똑같은데 전송은 훨씬 빨라요. 영상 압축은 영상 길이만큼 시간이 걸려서, 와이파이면 안 켜도 돼요. 사진이 아주 많으면 묶음이 둘로 나뉘는데, 그냥 <b>1묶음</b> 보내고 <b>2묶음</b> 보내면 돼요.</p>
        </Section>

        <Section id="folder" title="폴더에서 다시 보기">
          <p>오늘 폴더에서 강아지를 탭하면 그 아이 사진이 모여 있어요. 사진을 탭하면 크게 보이고, 오른쪽 위 <b>편집</b>에서 자르기, 돌리기, 밝기를 만질 수 있어요. 영상은 앞뒤를 잘라낼 수 있고요.</p>
          <Shot src="11-folder-review" alt="강아지 폴더. 보낸 사진엔 1회 보냄 표시" />
          <p>엉뚱한 아이한테 들어간 사진은 오른쪽 위 <b>선택</b>으로 골라서 옮기면 돼요. 어제 사진이 보고 싶으면 날짜 옆 화살표로 넘기세요.</p>
        </Section>

        <Section id="faq" title="이럴 땐 이렇게">
          <p><b>카메라가 안 열려요.</b> 폰 설정에서 {isIOS ? '사파리' : '크롬'}에 카메라 권한이 꺼져 있을 거예요. 켜 주시면 돼요.</p>
          <p><b>등원 체크한 아이가 카메라에 없어요.</b> 등원 체크는 날짜마다 새로 해요. 어제 체크한 건 오늘 안 남아요.</p>
          <p><b>보내기를 눌렀는데 공유 창이 안 떠요.</b> 버튼 아래에 빨간 상자가 뜰 거예요. 그 내용을 그대로 피드백으로 보내 주시면 확인해서 고칠게요.</p>
          <p><b>폰 용량이 부족해요.</b> 설정에 <b>보낸 사진 원본 자동 정리</b>가 있어요. 이미 보낸 사진만 며칠 지나면 원본을 지우고 작은 썸네일만 남겨요. 안 보낸 사진은 절대 안 건드려요.</p>
          <p><b>그리고 두 가지는 꼭 알아두세요.</b> 사진은 이 폰 안에만 있어서 폰을 바꾸면 따라가지 않아요. 그리고 지운 사진은 못 되돌려요. 애매하면 그냥 두세요.</p>
        </Section>

        <Section id="feedback" title="불편한 점 알려주기">
          <p>쓰다가 이상하거나 불편한 게 있으면 설정의 <b>피드백 보내기</b>로 알려 주세요. 어느 화면에서 뭘 했더니 어떻게 됐는지 적고, 화면 캡처를 붙여 주시면 제일 좋아요. 보고 바로 고칠게요.</p>
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


function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="guide__shot">
      <img src={`${import.meta.env.BASE_URL}guide/${src}.jpg`} alt={alt} loading="lazy" />
      <figcaption>{alt}</figcaption>
    </figure>
  );
}
