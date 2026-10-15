import { useCallback, useEffect, useRef, useState } from 'react';

const api = async (path, opts) => {
  const res = await fetch(path, { credentials: 'include', ...opts,
    headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { body });
  return body;
};

export default function App() {
  const [status, setStatus] = useState(null);
  const [banner, setBanner] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [debug, setDebug] = useState(null);
  const timer = useRef();

  const loadStatus = useCallback(() => api('/api/auth/status').then(setStatus).catch((e) => setBanner({ type: 'error', text: e.message })), []);
  const loadDebug = useCallback(() => api('/api/instagram/debug').then(setDebug).catch(() => {}), []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('error')) setBanner({ type: 'error', text: p.get('error') });
    if (p.get('connected')) setBanner({ type: 'success', text: 'Instagram connected.' });
    if (p.toString()) window.history.replaceState({}, '', '/');
    loadStatus(); loadDebug();
  }, [loadStatus, loadDebug]);

  useEffect(() => {
    if (!publishing) return;
    timer.current = setInterval(loadDebug, 2000);
    return () => clearInterval(timer.current);
  }, [publishing, loadDebug]);

  async function publish(e) {
    e.preventDefault();
    setPublishing(true); setResult(null); setBanner(null);
    try {
      const r = await api('/api/instagram/publish', { method: 'POST', body: JSON.stringify({ videoUrl, caption }) });
      setResult({ ok: true, text: `Published. Media ID: ${r.mediaId}` });
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally { setPublishing(false); loadDebug(); }
  }

  async function disconnect() {
    await api('/api/auth/disconnect', { method: 'POST' });
    setResult(null); setBanner({ type: 'success', text: 'Disconnected (server-side session cleared).' });
    loadStatus(); loadDebug();
  }

  if (!status) return <main><h1>Instagram API Tester</h1><p>Loading…</p></main>;
  const acct = status.account;

  return (
    <main>
      <header><h1>Instagram API Tester</h1><span className="tag">{status.loginType} login · Graph {status.graphVersion}</span></header>
      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}
      {status.configProblems.length > 0 && (
        <div className="banner error"><strong>Configuration problems</strong><ul>{status.configProblems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}

      <section className="card">
        <h2>Connection</h2>
        <p>Status: <strong className={status.connected ? 'ok' : 'bad'}>{status.connected ? 'Connected' : 'Not connected'}</strong></p>
        {!status.connected && <a className="btn" href="/api/auth/login">Connect Instagram</a>}
        {acct && (<>
          <dl>
            <dt>Username</dt><dd>@{acct.username}</dd>
            <dt>Account ID</dt><dd>{acct.id}</dd>
            <dt>Granted permissions</dt><dd>{acct.permissions?.length ? acct.permissions.join(', ') : 'Not reported by API'}</dd>
            {acct.expiresAt && <><dt>Token expires</dt><dd>{new Date(acct.expiresAt).toLocaleString()}</dd></>}
          </dl>
          <button className="btn secondary" onClick={disconnect}>Disconnect</button>
        </>)}
        <p className="hint">Redirect URI sent to Meta: <code>{status.redirectUri}</code></p>
      </section>

      {status.connected && (
        <section className="card">
          <h2>Publish a Reel</h2>
          <form onSubmit={publish}>
            <label>Video URL (public, direct link to an MP4/MOV)
              <input type="url" required value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://example.com/video.mp4" />
            </label>
            <label>Caption <span className="hint">{caption.length}/2200</span>
              <textarea rows="4" maxLength="2200" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
            <button className="btn" disabled={publishing}>{publishing ? 'Publishing…' : 'Publish Reel'}</button>
          </form>
          {result && <div className={`banner ${result.ok ? 'success' : 'error'}`}>{result.text}</div>}
        </section>
      )}

      <section className="card">
        <h2>Debug</h2>
        <p>Stage: <code>{debug?.stage ?? 'idle'}</code> · Processing: <code>{debug?.processing ?? '—'}</code></p>
        {debug?.error && <p className="bad">Error: {debug.error}</p>}
        {debug?.result && <pre>{JSON.stringify(debug.result, null, 2)}</pre>}
        <pre>{debug?.log?.length ? debug.log.map((l) => `${l.t.slice(11, 19)}  ${l.msg}`).join('\n') : 'No activity yet.'}</pre>
      </section>
    </main>
  );
}
