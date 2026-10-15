import { Router } from 'express';
import { config } from '../config.js';
import { getSession, resetDebug, log } from '../session.js';
import { createReelContainer, getContainerStatus, publishContainer, redact } from '../services/meta.js';

const router = Router();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

router.get('/debug', (req, res) => res.json(getSession(req, res).debug));

router.post('/publish', async (req, res) => {
  const s = getSession(req, res);
  if (!s.conn) return res.status(401).json({ error: 'Not connected' });
  if (s.busy) return res.status(409).json({ error: 'A publish is already in progress' });
  const { videoUrl, caption = '' } = req.body || {};
  let url;
  try { url = new URL(videoUrl); } catch { return res.status(400).json({ error: 'videoUrl must be a valid URL' }); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return res.status(400).json({ error: 'videoUrl must be http(s)' });
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return res.status(400).json({ error: 'Instagram must be able to fetch the video: use a publicly accessible URL, not localhost' });
  if (String(caption).length > 2200) return res.status(400).json({ error: 'Caption exceeds 2200 characters' });

  s.busy = true; resetDebug(s);
  const d = s.debug, conn = s.conn;
  try {
    d.stage = 'creating_container'; log(s, 'Creating REELS container');
    const { id: containerId } = await createReelContainer(conn, url.toString(), String(caption));
    log(s, `Container created: ${containerId}`);

    d.stage = 'processing';
    const deadline = Date.now() + config.pollMaxMs;
    for (;;) {
      const st = await getContainerStatus(conn, containerId);
      d.processing = st.status_code;
      log(s, `Status: ${st.status_code}${st.status ? ` (${st.status})` : ''}`);
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw Object.assign(new Error(`Instagram processing ended with ${st.status_code}${st.status ? `: ${st.status}` : ''}`), { stage: 'processing' });
      if (Date.now() > deadline) throw Object.assign(new Error('Timed out waiting for Instagram to process the video'), { stage: 'processing' });
      await sleep(config.pollIntervalMs);
    }

    d.stage = 'publishing'; log(s, 'Publishing container');
    const pub = await publishContainer(conn, containerId);
    d.stage = 'published'; d.result = { mediaId: pub.id, containerId };
    log(s, `Published. Media ID: ${pub.id}`);
    res.json({ ok: true, mediaId: pub.id });
  } catch (err) {
    d.stage = 'failed'; d.error = redact(err.message);
    log(s, `Error at ${err.stage || d.stage}: ${d.error}${err.metaCode ? ` (code ${err.metaCode})` : ''}`);
    res.status(502).json({ error: d.error, stage: err.stage, metaCode: err.metaCode });
  } finally { s.busy = false; }
});

export default router;
