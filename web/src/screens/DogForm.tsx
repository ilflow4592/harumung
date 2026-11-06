import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { TopBar } from '../components/ui';
import type { Sex } from '../db/db';
import { createDog, deleteDogIfEmpty, getDog, setDogActive, updateDog } from '../db/repo';
import { track } from '../lib/analytics';
import { makeThumbnail } from '../lib/camera';

// iOS 사파리는 파일 입력을 열면 항상 자체 시트(사진 보관함·사진 찍기·파일 선택)를 띄운다.
// 우리 시트와 겹치지 않게 iOS에서는 바로 그 시트를 연다.
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

const normalizePhone = (s: string) => s.replace(/[^0-9]/g, '');
const isPhone = (s: string) => /^01[016789][0-9]{7,8}$/.test(s);

/** 강아지 등록(/dogs/new)과 수정(/dogs/:dogId/edit)을 같이 쓴다. */
export function DogFormScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { dogId } = useParams();
  const editing = !!dogId;
  const { data: existing } = useQuery({ queryKey: ['dog', dogId], queryFn: () => getDog(dogId ?? ''), enabled: editing });
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [showPhone2, setShowPhone2] = useState(false);
  const [memo, setMemo] = useState('');

  // 수정 모드: 기존 값을 한 번만 폼에 채운다
  useEffect(() => {
    if (!existing || loaded) return;
    setName(existing.name);
    setSex(existing.sex);
    setMemo(existing.memo ?? '');
    setPhone1(existing.phones[0] ?? '');
    if (existing.phones[1]) { setPhone2(existing.phones[1]); setShowPhone2(true); }
    if (existing.thumbBlob) { setThumb(existing.thumbBlob); setThumbUrl(URL.createObjectURL(existing.thumbBlob)); }
    setLoaded(true);
  }, [existing, loaded]);

  const p1 = normalizePhone(phone1);
  const p2 = normalizePhone(phone2);
  const valid = name.trim().length > 0 && sex !== null && (p1.length === 0 || isPhone(p1)) && (p2.length === 0 || isPhone(p2));

  const onPickPhoto = async (file: File | undefined) => {
    setSheetOpen(false);
    if (!file) return;
    const t = await makeThumbnail(file, 400);
    track('dog_photo_picked', { editing });
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    setThumb(t);
    setThumbUrl(URL.createObjectURL(t));
  };

  const clearPhoto = () => {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    setThumb(null);
    setThumbUrl(null);
    setSheetOpen(false);
    // 같은 파일을 다시 고를 수 있게 입력값을 비운다
    if (cameraInput.current) cameraInput.current.value = '';
    if (albumInput.current) albumInput.current.value = '';
  };

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['dogs'] }),
      qc.invalidateQueries({ queryKey: ['dog'] }),
      qc.invalidateQueries({ queryKey: ['folders'] }),
      qc.invalidateQueries({ queryKey: ['contacts'] }),
      qc.invalidateQueries({ queryKey: ['inactive-dogs'] }),
    ]);
  };

  const submit = async () => {
    if (!valid || !sex) return;
    const input = { name: name.trim(), sex, thumbBlob: thumb, memo: memo.trim() || null, phones: [p1, p2] };
    if (editing && dogId) await updateDog(dogId, input);
    else await createDog(input);
    track(editing ? 'dog_updated' : 'dog_created', { has_photo: !!thumb, sex, phone_count: [p1, p2].filter(Boolean).length, has_memo: !!memo.trim() });
    await invalidate();
    navigate(-1);
  };

  /** 퇴원: 숨기기만. 사진은 남는다. 사진이 없으면 완전 삭제를 제안. */
  const retire = async () => {
    if (!dogId) return;
    if (!window.confirm(`${name}을(를) 퇴원 처리할까요? 목록과 카메라에서 사라지고, 사진은 남아요. 설정에서 되돌릴 수 있어요.`)) return;
    await setDogActive(dogId, false);
    track('dog_retired');
    await invalidate();
    navigate('/dogs', { replace: true });
  };

  const remove = async () => {
    if (!dogId) return;
    if (!window.confirm(`${name}을(를) 완전히 삭제할까요? 되돌릴 수 없어요.`)) return;
    const ok = await deleteDogIfEmpty(dogId);
    track('dog_delete_attempted', { ok });
    if (!ok) { window.alert('사진이 있는 아이는 삭제할 수 없어요. 대신 퇴원 처리를 해 주세요.'); return; }
    await invalidate();
    navigate('/dogs', { replace: true });
  };

  return (
    <div className="screen">
      <TopBar title={editing ? '강아지 정보 수정' : '강아지 등록'} onBack={() => navigate(-1)} />
      <main className="body" style={{ gap: 20, paddingBottom: 120 }}>
        <div style={{ alignSelf: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            aria-label={thumbUrl ? '정면 사진 바꾸기' : '정면 사진 추가'}
            onClick={() => (isIOS ? albumInput.current?.click() : setSheetOpen(true))}
            style={{ width: 120, height: 120, borderRadius: 36, border: '2px dashed var(--mint-mid)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: 'var(--mint)', fontWeight: 700, fontSize: 12, padding: 0 }}
          >
            {thumbUrl ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '정면 사진'}
          </button>
          {thumbUrl ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger-light)' }}
              onClick={clearPhoto}
            >
              사진 지우기
            </button>
          ) : (
            <span className="sub">목록 썸네일로 쓰여요. 얼굴이 잘 보이게 1장</span>
          )}
          {/* capture 속성이 있으면 카메라가 바로 열리고, 없으면 앨범 선택기가 열린다 */}
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickPhoto(e.target.files?.[0])} />
          <input ref={albumInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickPhoto(e.target.files?.[0])} />
        </div>

        {sheetOpen ? (
          <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
            <div className="sheet" role="dialog" aria-label="정면 사진 선택" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn" onClick={() => cameraInput.current?.click()}>카메라로 찍기</button>
              <button type="button" className="btn btn--outline" onClick={() => albumInput.current?.click()}>앨범에서 가져오기</button>
              {thumbUrl ? (
                <button type="button" className="btn btn--ghost" onClick={clearPhoto}>사진 지우기</button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={() => setSheetOpen(false)}>취소</button>
            </div>
          </div>
        ) : null}

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
          <label className="label" htmlFor="phone1">보호자 연락처 (선택)</label>
          <input id="phone1" className="input" type="tel" inputMode="tel" value={phone1} onChange={(e) => setPhone1(e.target.value)} placeholder="010-0000-0000" />
          {showPhone2 ? (
            <input className="input" type="tel" inputMode="tel" value={phone2} onChange={(e) => setPhone2(e.target.value)} placeholder="두 번째 연락처" />
          ) : (
            <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: 'flex-start', border: 0, color: 'var(--mint)', fontWeight: 700 }} onClick={() => setShowPhone2(true)}>+ 연락처 하나 더 (최대 2개)</button>
          )}
          <span className="sub">보내기 화면에서 누구에게 보낼지 확인하는 용도예요</span>
        </div>

        <div className="field">
          <label className="label" htmlFor="memo">메모 <span className="sub">(선택)</span></label>
          <textarea id="memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="알레르기, 성향, 주의할 점" />
        </div>
      </main>
      {editing ? (
        <div className="body" style={{ paddingTop: 0, gap: 8 }}>
          <button type="button" className="btn btn--ghost" style={{ color: 'var(--danger)' }} onClick={retire}>퇴원 처리 (목록에서 숨김)</button>
          <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: 'center', color: 'var(--text-2)' }} onClick={remove}>완전 삭제 (사진이 없을 때만)</button>
        </div>
      ) : null}
      <footer className="footer">
        <button type="button" className="btn" disabled={!valid || (editing && !loaded)} onClick={submit}>{editing ? '저장' : '등록하기'}</button>
      </footer>
    </div>
  );
}
