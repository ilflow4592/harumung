import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';
import type { Sex } from '../db/db';
import { createDog } from '../db/repo';
import { makeThumbnail } from '../lib/camera';

const normalizePhone = (s: string) => s.replace(/[^0-9]/g, '');
const isPhone = (s: string) => /^01[016789][0-9]{7,8}$/.test(s);

export function DogFormScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [showPhone2, setShowPhone2] = useState(false);
  const [memo, setMemo] = useState('');

  const p1 = normalizePhone(phone1);
  const p2 = normalizePhone(phone2);
  const valid = name.trim().length > 0 && sex !== null && isPhone(p1) && (p2.length === 0 || isPhone(p2));

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const t = await makeThumbnail(file, 400);
    setThumb(t);
    setThumbUrl(URL.createObjectURL(t));
  };

  const submit = async () => {
    if (!valid || !sex) return;
    await createDog({ name: name.trim(), sex, thumbBlob: thumb, memo: memo.trim() || null, phones: [p1, p2] });
    await qc.invalidateQueries({ queryKey: ['dogs'] });
    await qc.invalidateQueries({ queryKey: ['folders'] });
    navigate(-1);
  };

  return (
    <div className="screen">
      <TopBar title="강아지 등록" onBack={() => navigate(-1)} />
      <main className="body" style={{ gap: 20, paddingBottom: 120 }}>
        <label style={{ alignSelf: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ width: 120, height: 120, borderRadius: 36, border: '2px dashed var(--mint-mid)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: 'var(--mint)', fontWeight: 700, fontSize: 12 }}>
            {thumbUrl ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '정면 사진'}
          </span>
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickPhoto(e.target.files?.[0])} />
          <span className="sub">목록 썸네일로 쓰여요. 얼굴이 잘 보이게 1장</span>
        </label>

        <div className="field">
          <label className="label" htmlFor="name">강아지 이름 <span className="required">*</span></label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 콩이" maxLength={20} />
        </div>

        <div className="field">
          <span className="label">성별 <span className="required">*</span></span>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['MALE', 'FEMALE'] as const).map((s) => (
              <label key={s} className={`sexbox sexbox--${s} ${sex === s ? 'checked' : ''}`}>
                <input type="checkbox" checked={sex === s} onChange={() => setSex(s)} />
                {s === 'MALE' ? '남아' : '여아'}
              </label>
            ))}
          </div>
          <span className="sub">하나만 선택돼요. 다른 쪽을 고르면 자동으로 해제</span>
        </div>

        <div className="field">
          <label className="label" htmlFor="phone1">보호자 연락처 <span className="required">*</span></label>
          <input id="phone1" className="input" type="tel" inputMode="tel" value={phone1} onChange={(e) => setPhone1(e.target.value)} placeholder="010-0000-0000" />
          {showPhone2 ? (
            <input className="input" type="tel" inputMode="tel" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="두 번째 연락처" />
          ) : (
            <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: 'flex-start', border: 0, color: 'var(--blue)', fontWeight: 700 }} onClick={() => setShowPhone2(true)}>+ 연락처 하나 더 (최대 2개)</button>
          )}
          <span className="sub">하루멍 링크를 알림톡·문자로 보내는 데만 써요</span>
        </div>

        <div className="field">
          <label className="label" htmlFor="memo">메모 <span className="sub">(선택)</span></label>
          <textarea id="memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="알레르기, 성향, 주의할 점" />
        </div>
      </main>
      <footer className="footer">
        <button type="button" className="btn" disabled={!valid} onClick={submit}>등록하기</button>
      </footer>
    </div>
  );
}
