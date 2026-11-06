import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';
import { emptyTrash, listActiveDogs, listPurgeCandidates, purgeOriginals, storageStats, wipeAll } from '../db/repo';
import { PURGE_OPTIONS, getPurgeDays, isIOS, isStandalone, requestPersistentStorage, setPurgeDays } from '../lib/settings';
import { formatBytes } from '../lib/share';

/** 설정: 저장공간·자동 정리·홈 화면 설치·앱 정보. 서버 없는 동안 폰 저장공간 관리가 핵심. */
export function SettingsScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: stats } = useQuery({ queryKey: ['storage-stats'], queryFn: storageStats });
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const [purgeDays, setDays] = useState(getPurgeDays());
  const { data: candidates = [] } = useQuery({ queryKey: ['purge-candidates', purgeDays], queryFn: () => listPurgeCandidates(purgeDays || 0), enabled: purgeDays > 0 });
  const { data: candidatesNow = [] } = useQuery({ queryKey: ['purge-candidates', 0], queryFn: () => listPurgeCandidates(0) });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['storage-stats'] }),
    qc.invalidateQueries({ queryKey: ['purge-candidates'] }),
    qc.invalidateQueries({ queryKey: ['folders'] }),
    qc.invalidateQueries({ queryKey: ['dog-kept'] }),
  ]);

  const changeDays = (d: number) => { setPurgeDays(d); setDays(d); };

  const purgeNow = async () => {
    const bytes = candidatesNow.reduce((n, m) => n + (m.blob?.size ?? 0) + (m.compressedBlob?.size ?? 0), 0);
    if (!window.confirm(`보낸 사진·영상 ${candidatesNow.length}개의 원본을 지울까요? ${formatBytes(bytes)}가 비워져요. 썸네일은 남고, 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      const freed = await purgeOriginals(candidatesNow.map((m) => m.id));
      await refresh();
      setMsg(`${formatBytes(freed)} 비웠어요`);
    } finally { setBusy(false); }
  };

  const trash = async () => {
    setBusy(true);
    try {
      const n = await emptyTrash();
      await refresh();
      setMsg(`삭제 기록 ${n}개를 비웠어요`);
    } finally { setBusy(false); }
  };

  const wipe = async () => {
    if (!window.confirm('강아지·사진·기록을 전부 지울까요? 테스트 기기에서만 쓰세요. 되돌릴 수 없어요.')) return;
    if (!window.confirm('정말 전부 지울까요?')) return;
    await wipeAll();
    await qc.invalidateQueries();
    navigate('/folders', { replace: true });
  };

  const persist = async () => {
    const r = await requestPersistentStorage();
    setPersisted(r);
    setMsg(r ? '브라우저가 저장소를 보호해요' : r === null ? '이 브라우저는 보호 설정이 없어요. 홈 화면에 설치하면 돼요' : '보호 요청이 거절됐어요. 홈 화면 설치를 권해요');
  };

  const quotaPct = stats?.quotaBytes && stats.usageBytes ? Math.min(100, Math.round((stats.usageBytes / stats.quotaBytes) * 100)) : null;
  const standalone = isStandalone();

  return (
    <div className="screen screen--surface">
      <TopBar title="설정" onBack={() => navigate(-1)} />
      <main className="body" style={{ paddingBottom: 40 }}>
        <Link to="/guide" className="card card--row" style={{ borderColor: 'var(--mint-mid)', color: 'inherit' }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--mint-light)', color: 'var(--mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flex: '0 0 auto' }}>?</span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="title">사용 안내</span>
            <span className="sub">등록 → 등원 체크 → 촬영 → 검수 → 보내기, 화면 그림과 함께</span>
          </span>
          <span className="sub">열기 ›</span>
        </Link>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="title">저장공간</div>
          {stats ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <b style={{ fontSize: 26 }}>{formatBytes(stats.totalBytes)}</b>
                <span className="sub">하루멍이 이 폰에 쓰는 용량</span>
              </div>
              {quotaPct !== null ? (
                <div className="bar"><span style={{ width: `${quotaPct}%` }} /></div>
              ) : null}
              {quotaPct !== null ? <span className="sub">브라우저 허용량의 {quotaPct}% 사용 중</span> : null}
              <table className="kv">
                <tbody>
                  <tr><td>사진 원본</td><td>{stats.photoCount}장</td><td>{formatBytes(stats.photoBytes)}</td></tr>
                  <tr><td>영상 원본</td><td>{stats.videoCount}개</td><td>{formatBytes(stats.videoBytes)}</td></tr>
                  <tr><td>보내기용 변환본</td><td></td><td>{formatBytes(stats.compressedBytes)}</td></tr>
                  <tr><td>썸네일</td><td></td><td>{formatBytes(stats.thumbBytes)}</td></tr>
                  <tr><td>원본 정리됨</td><td>{stats.purgedCount}개</td><td></td></tr>
                </tbody>
              </table>
            </>
          ) : <span className="sub">계산 중…</span>}
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="title">보낸 사진 원본 자동 정리</div>
          <span className="sub">보호자에게 보낸 사진·영상은 며칠 뒤 원본을 지우고 썸네일만 남겨요. 아직 안 보낸 사진과 미지정 사진은 지우지 않아요.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {PURGE_OPTIONS.map((d) => (
              <button key={d} type="button" className={`btn btn--small ${purgeDays === d ? '' : 'btn--ghost'}`} style={{ flex: 1 }} onClick={() => changeDays(d)}>
                {d === 0 ? '끄기' : `${d}일 뒤`}
              </button>
            ))}
          </div>
          {purgeDays > 0 ? <span className="sub">다음에 앱을 열 때 정리될 것: {candidates.length}개</span> : null}
          <button type="button" className="btn btn--outline" disabled={busy || candidatesNow.length === 0} onClick={purgeNow}>
            보낸 사진 원본 지금 정리 ({candidatesNow.length}개)
          </button>
          {stats && stats.trashCount > 0 ? (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={trash}>삭제 기록 비우기 ({stats.trashCount}개)</button>
          ) : null}
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="title">홈 화면 설치 {standalone ? <span className="badge badge--mint">설치됨</span> : <span className="badge badge--pink">미설치</span>}</div>
          {standalone ? (
            <span className="sub">앱으로 실행 중이에요. 브라우저가 사진을 임의로 지우지 않아요.</span>
          ) : isIOS ? (
            <ol className="steps">
              <li>사파리 아래 가운데 <b>공유</b> 버튼(네모에 화살표)을 누르세요</li>
              <li>아래로 내려 <b>홈 화면에 추가</b>를 누르세요</li>
              <li>오른쪽 위 <b>추가</b>를 누르면 끝이에요</li>
            </ol>
          ) : (
            <ol className="steps">
              <li>브라우저 오른쪽 위 <b>⋮</b> 메뉴를 누르세요</li>
              <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르세요</li>
            </ol>
          )}
          {!standalone ? <span className="sub" style={{ color: 'var(--pink)' }}>설치하지 않고 브라우저 탭으로만 쓰면 7일 동안 안 열었을 때 사진이 지워질 수 있어요.</span> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="sub" style={{ flex: 1 }}>저장소 보호: {persisted === true ? '켜짐' : persisted === false ? '꺼짐' : '브라우저 미지원'}</span>
            {persisted !== true ? <button type="button" className="btn btn--small btn--outline" onClick={persist}>보호 요청</button> : null}
          </div>
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="title">앱 정보</div>
          <table className="kv">
            <tbody>
              <tr><td>버전</td><td></td><td>0.1 (테스트)</td></tr>
              <tr><td>강아지</td><td></td><td>{dogs.length}마리</td></tr>
              <tr><td>데이터 위치</td><td></td><td>이 폰 안에만</td></tr>
            </tbody>
          </table>
          <button type="button" className="btn btn--ghost" style={{ color: 'var(--pink)' }} onClick={wipe}>전체 초기화 (테스트용)</button>
        </section>

        {msg ? <span className="sub">{msg}</span> : null}
      </main>
    </div>
  );
}
