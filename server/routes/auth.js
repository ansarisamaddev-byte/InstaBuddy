import { Router } from 'express';
import crypto from 'node:crypto';
import { config, configProblems } from '../config.js';
import { getSession, resetDebug } from '../session.js';
import { authorizationUrl, completeLogin, redact } from '../services/meta.js';

const router = Router();
const STATE_TTL_MS = 10 * 60 * 1000;
const back = (res, params) => res.redirect(`${config.frontendUrl}/?${new URLSearchParams(params)}`);

router.get('/login', (req, res) => {
  const problems = configProblems();
  if (problems.length) return back(res, { error: `Server not configured: ${problems.join('; ')}` });
  const s = getSession(req, res);
  const state = crypto.randomBytes(24).toString('base64url');
  s.oauth = { state, expires: Date.now() + STATE_TTL_MS };
  res.redirect(authorizationUrl(state));
});

router.get('/callback', async (req, res) => {
  const s = getSession(req, res);
  const { code, state, error, error_description, error_reason } = req.query;
  const saved = s.oauth;
  s.oauth = null; // single use, whatever happens next
  if (error) return back(res, { error: `Authorization cancelled or denied: ${error_description || error_reason || error}` });
  if (!saved || !state || typeof state !== 'string' || saved.state.length !== state.length ||
      !crypto.timingSafeEqual(Buffer.from(saved.state), Buffer.from(state))) {
    return back(res, { error: 'Invalid OAuth state (possible CSRF, or the server restarted). Please try again.' });
  }
  if (Date.now() > saved.expires) return back(res, { error: 'Login attempt expired. Please try again.' });
  if (!code) return back(res, { error: 'No authorization code returned.' });
  resetDebug(s);
  try {
    const r = await completeLogin(String(code).replace(/#_$/, ''));
    s.conn = { ...r, loginType: config.loginType };
    r.notes.forEach((n) => s.debug.log.push({ t: new Date().toISOString(), msg: n }));
    back(res, { connected: '1' });
  } catch (err) {
    back(res, { error: `${err.stage || 'login'} failed: ${redact(err.message)}` });
  }
});

router.get('/status', (req, res) => {
  const s = getSession(req, res);
  const c = s.conn;
  res.json({
    configProblems: configProblems(), loginType: config.loginType, graphVersion: config.version,
    redirectUri: config.redirectUri, requestedScopes: config.scopes,
    connected: !!c,
    account: c ? { username: c.username, id: c.igUserId, permissions: c.permissions, expiresAt: c.expiresAt } : null,
  });
});

router.post('/disconnect', (req, res) => {
  const s = getSession(req, res);
  s.conn = null; s.oauth = null; resetDebug(s);
  res.json({ ok: true });
});

export default router;
