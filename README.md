# Instagram API Tester

Small local app to test official Instagram OAuth and Reel publishing. React + Vite (client), Express (server), no database. Tokens and OAuth state live **in server memory only** and are lost on restart; you just reconnect.

## Flows (set `META_LOGIN_TYPE`)

| | `instagram` (default) | `facebook` |
|---|---|---|
| Authorize | `https://www.instagram.com/oauth/authorize` | `https://www.facebook.com/{ver}/dialog/oauth` |
| Token exchange | `POST https://api.instagram.com/oauth/access_token`, then `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token` | `GET https://graph.facebook.com/{ver}/oauth/access_token` (+ `fb_exchange_token`) |
| Account lookup | `GET https://graph.instagram.com/{ver}/me?fields=user_id,username` | `GET /me/accounts?fields=...instagram_business_account{id,username}` (uses the Page token) |
| Publish host | `graph.instagram.com` | `graph.facebook.com` |
| Scopes | `instagram_business_basic`, `instagram_business_content_publish` | `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` |

Both flows publish the same way: `POST /{ig-id}/media` (`media_type=REELS`, `video_url`, `caption`) -> poll `GET /{container-id}?fields=status_code,status` until `FINISHED` -> `POST /{ig-id}/media_publish`.

These endpoints and scopes are from my knowledge of Meta's docs, not verified live. Check them against developers.facebook.com before relying on them; Meta changes versions and scope names.

## Setup

1. Install Node.js 20+.
2. `npm run install:all`
3. Create the Meta app at developers.facebook.com/apps (type: Business).
   - **Instagram Login:** add the product *Instagram* -> *API setup with Instagram login*. Add your redirect URI under *Business login settings*. Copy the **Instagram app ID/secret** shown there (these differ from the main app ID/secret) into `META_APP_ID` / `META_APP_SECRET`.
   - **Facebook Login:** add *Facebook Login for Business* (or Facebook Login) and put the redirect URI under *Valid OAuth Redirect URIs*. Your Instagram account must be Business/Creator and linked to a Facebook Page you manage.
4. Your Instagram account must be a **professional** (Business or Creator) account.
5. While the app is in **Development mode**, only people with a role on the app (add your test account under App roles / Instagram testers, and accept the invite) can authorize. Serving other accounts requires App Review and Advanced Access for the publish permission.
6. `cp .env.example .env` and fill in `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_TYPE`.
7. Redirect URI (must match the dashboard and `.env` character for character):

       http://localhost:5000/api/auth/callback

   If you change `PORT`, update `META_REDIRECT_URI` and the dashboard to match. Some Meta products require HTTPS redirect URIs even for localhost; if so, use an HTTPS tunnel and set `META_REDIRECT_URI`, `BACKEND_URL` and `FRONTEND_URL` accordingly.
8. `npm run dev`, then open http://localhost:5173

## Publishing a test Reel

Click **Connect Instagram**, approve on Meta's site, then enter a **publicly reachable direct URL** to an MP4/MOV (H.264/AAC, vertical 9:16 recommended; Instagram's servers must be able to fetch it, so localhost URLs are rejected). Add a caption and click **Publish Reel**. The debug panel shows the stage, container status and any API error. "Published" appears only after `media_publish` returns an ID.

## Security notes

- App secret and tokens never leave the server; API responses and logs are redacted.
- OAuth `state` is random, tied to the session cookie, single-use, expires after 10 minutes, and compared in constant time.
- No Instagram passwords are collected. No production auth, persistence or HTTPS cookies (`secure` is off for localhost).

## Common errors

- *Invalid redirect_uri*: dashboard URI differs from `META_REDIRECT_URI`.
- *Permission/“not authorized”*: account isn't a tester/role holder, or lacks the publish permission/Advanced Access.
- *No Page with linked Instagram account* (Facebook flow): link the IG account to a Page and grant that Page at login.
- Container `ERROR`: unsupported codec/size/duration or the URL isn't publicly fetchable.
