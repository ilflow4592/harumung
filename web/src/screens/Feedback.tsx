import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';
import { track } from '../lib/analytics';
import { FEEDBACK_TYPES, preparePhotos, sendFeedback, type FeedbackType } from '../lib/feedbackSend';

/** 피드백 보내기. 유형·제목·내용·사진(최대 3장). 전송은 PostHog 이벤트. */
export function FeedbackScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = new URLSearchParams(location.search).get('from') ?? 'unknown';
  const [type, setType] = useState<FeedbackType>('friction');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'sent' | 'offline' | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list).filter((f) => f.type.startsWith('image/'))].slice(0, 3);
    urls.forEach((u) => URL.revokeObjectURL(u));
    setFiles(next);
    setUrls(next.map((f) => URL.createObjectURL(f)));
    if (input.current) input.current.value = '';
  };
  const removeAt = (i: number) => {
    const next = files.filter((_, k) => k !== i);
    URL.revokeObjectURL(urls[i]);
    setFiles(next);
    setUrls(next.map((f) => URL.createObjectURL(f)));
  };

  const valid = body.trim().length >= 2;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const photos = files.length ? await preparePhotos(files) : [];
      const ok = sendFeedback({ type, title: title.trim(), body: body.trim(), photos, screen: from });
      track('feedback_submitted', { feedback_type: type, has_title: !!title.trim(), body_length: body.trim().length, photo_count: photos.length, from });
      setDone(ok ? 'sent' : 'offline');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="screen">
        <TopBar title="피드백" onBack={() => navigate(-1)} />
        <main className="body" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 48, gap: 14 }}>
          <span className="check check--on" style={{ width: 56, height: 56, borderRadius: 28, fontSize: 26 }}>✓</span>
          <div className="title" style={{ fontSize: 18 }}>{done === 'sent' ? '보냈어요. 고맙습니다!' : '저장했어요'}</div>
          <span className="sub">
            {done === 'sent' ? '하나하나 읽고 다음 업데이트에 반영할게요.' : '지금 이 버전은 전송이 꺼져 있어 폰에만 남았어요. 캡처해서 직접 보내 주세요.'}
          </span>
          <button type="button" className="btn" style={{ width: 'auto', padding: '0 28px' }} onClick={() => navigate(-1)}>돌아가기</button>
        </main>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="피드백 보내기" onBack={() => navigate(-1)} />
      <main className="body" style={{ gap: 18, paddingBottom: 120 }}>
        <span className="sub">안 되는 것, 불편한 것, 있었으면 하는 것. 짧아도 좋아요. 화면 캡처를 같이 붙이면 훨씬 빨리 고쳐요.</span>

        <div className="field">
          <label className="label" htmlFor="fb-type">어떤 내용인가요 <span className="required">*</span></label>
          <select id="fb-type" className="input" value={type} onChange={(e) => setType(e.target.value as FeedbackType)}>
            {FEEDBACK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="fb-title">제목 <span className="sub">(선택)</span></label>
          <input id="fb-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 영상 보내기가 중간에 멈춰요" maxLength={60} />
        </div>

        <div className="field">
          <label className="label" htmlFor="fb-body">내용 <span className="required">*</span></label>
          <textarea id="fb-body" className="input" style={{ height: 140 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="언제, 어느 화면에서, 무엇을 했더니 어떻게 됐는지 적어 주세요" maxLength={2000} />
          <span className="sub" style={{ alignSelf: 'flex-end' }}>{body.length} / 2000</span>
        </div>

        <div className="field">
          <span className="label">사진 <span className="sub">(선택, 최대 3장)</span></span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {urls.map((u, i) => (
              <span key={u} className="cell" style={{ width: 84, height: 84, aspectRatio: 'auto' }}>
                <img src={u} alt="" />
                <button type="button" className="cell__del" aria-label="사진 빼기" onClick={() => removeAt(i)}>✕</button>
              </span>
            ))}
            {files.length < 3 ? (
              <button type="button" className="fb-add" onClick={() => input.current?.click()}>+<br /><small>캡처·사진</small></button>
            ) : null}
          </div>
          <input ref={input} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
          <span className="sub">사진은 작게 줄여서 보내져요. 강아지 사진이 들어가도 괜찮아요.</span>
        </div>
      </main>
      <footer className="footer">
        <button type="button" className="btn" disabled={!valid || busy} onClick={submit}>{busy ? '보내는 중…' : '보내기'}</button>
      </footer>
    </div>
  );
}
