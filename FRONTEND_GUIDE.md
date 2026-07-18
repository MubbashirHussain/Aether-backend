# Aether API — Frontend Integration Guide

Base URL: `http://localhost:3000` (development) or your production URL.

---

## 1. Video Analysis Flow

### Step 1: Analyze a URL

```
POST /api/download
Content-Type: application/json

{
  "url": "https://www.tiktok.com/@user/video/123456789"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "platform": "tiktok",
    "id": "123456789",
    "title": "Video Title",
    "thumbnail": "https://...",
    "duration": 30,
    "author": "@user",
    "formats": [
      {
        "formatId": "0",
        "ext": "mp4",
        "resolution": "720x1280",
        "filesize": 5242880,
        "quality": "720p",
        "isAudioAvailable": true
      },
      {
        "formatId": "1",
        "ext": "mp4",
        "resolution": "480x854",
        "filesize": 2097152,
        "quality": "480p",
        "isAudioAvailable": true
      }
    ]
  }
}
```

**Note:** Direct video/audio URLs are **never** exposed to the client. All media is served through the server-side streaming endpoint using short-lived tokens.

---

## 2. Download with Ad Interstitial Flow

This flow shows an ad before allowing the download. After unlocking, you get a temporary `streamToken` to access the video.

### Step 2a: Start a Session

Pick a format and start a session for that specific format.

```
POST /api/download/session
Content-Type: application/json

{
  "url": "https://www.tiktok.com/@user/video/123456789",
  "formatId": "0"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | The original video URL |
| `formatId` | Yes | The format ID from the analysis response to lock into |

**Response:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "unlockAfter": 5
}
```

- `unlockAfter`: seconds to wait before the download is unlocked
- Session expires after 15 minutes of inactivity
- The session is tied to the specific `formatId` — unlocking only grants access to that format

### Step 2b: Wait (Show Ad)

Display an interstitial ad for `unlockAfter` seconds. After the timer expires, proceed to unlock.

### Step 2c: Unlock the Download

```
POST /api/download/unlock
Content-Type: application/json

{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "selectedFormat": {
      "formatId": "0",
      "ext": "mp4",
      "resolution": "720x1280",
      "filesize": 5242880,
      "quality": "720p",
      "isAudioAvailable": true
    },
    "streamToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

The unlock response only returns the format the session was created with, plus the stream token — no full metadata.

**Error Response (403) — unlock timer still running:**

```json
{
  "success": false,
  "unlockAfter": 3.2,
  "message": "Session not unlocked"
}
```

- `unlockAfter`: seconds remaining before the unlock is available. The frontend should wait this long and retry.

### Step 2d: Stream the Video

Use the `streamToken` to play or download the video:

```
GET /api/download/stream/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

To download as a file, add `?download=1`:

```
GET /api/download/stream/a1b2c3d4-e5f6-7890-abcd-ef1234567890?download=1
```

**Behavior:**
- Plays inline in a `<video>` element (supports seeking via Range requests)
- With `?download=1`, sets `Content-Disposition: attachment` for file download
- Token expires after **5 minutes** — refresh the unlock flow if it expires
- The browser **never** sees the original Instagram/TikTok/CDN URL

### Using the Stream Token in a `<video>` Element

```html
<video controls>
  <source src="/api/download/stream/a1b2c3d4-e5f6-7890-abcd-ef1234567890" type="video/mp4">
</video>
```

The browser will handle seeking automatically via HTTP Range requests.

---

## 3. Server-Side Format Download (with Audio Merge)

Use this endpoint when you want the server to download a specific format via yt-dlp and stream it directly to the client. This is useful for:
- Getting a specific quality/format not available via the stream token
- Server-side audio merging when a format is video-only

```
POST /api/download/format
Content-Type: application/json

{
  "url": "https://www.tiktok.com/@user/video/123456789",
  "formatId": "0",
  "isAudioAvailable": false
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | The original video URL (same as you passed to `/api/download`) |
| `formatId` | Yes | The format ID from the analysis response |
| `isAudioAvailable` | No | Pass `true` if the format has audio. Defaults to `false`. Set this from `formats[].isAudioAvailable`. |

**Response:** Binary stream with these headers:

| Header | Value | Description |
|--------|-------|-------------|
| `Content-Type` | `video/mp4` | MIME type of the output file |
| `Content-Disposition` | `attachment; filename="aether_0.mp4"` | Suggested filename for download |
| `X-Audio-Merged` | `true` / `false` | Whether audio was merged server-side |

**Error Response (404):**

```json
{
  "success": false,
  "message": "The requested format is no longer available. Try a different format or re-analyze the URL."
}
```

### When to Use Stream Token vs Format Download

| Scenario | Use |
|----------|-----|
| Play video in `<video>` element | Stream token (`GET /api/download/stream/:token`) |
| Download video as file | Stream token with `?download=1` |
| Need a specific format/quality | Format download (`POST /api/download/format`) |
| Format has no audio (video-only) | Format download — server auto-merges audio via ffmpeg |

---

## 4. Complete Integration Example (React/TypeScript)

```typescript
import { useState } from "react";

interface FormatItem {
  formatId: string;
  ext: string;
  resolution: string;
  filesize?: number;
  quality?: string;
  isAudioAvailable: boolean;
}

interface SafeVideoMetadata {
  platform: string;
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  formats: FormatItem[];
}

interface UnlockResponse {
  selectedFormat: FormatItem;
  streamToken: string;
}

interface SessionResponse {
  sessionId: string;
  unlockAfter: number;
}

const API_BASE = "http://localhost:3000";

async function analyzeUrl(url: string): Promise<SafeVideoMetadata> {
  const res = await fetch(`${API_BASE}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.errors?.[0]?.message || `Analysis failed (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

async function startSession(url: string, formatId: string): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/api/download/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, formatId }),
  });

  if (!res.ok) {
    throw new Error(`Session creation failed (${res.status})`);
  }

  return res.json();
}

/**
 * Attempt to unlock. Returns the unlock response on success.
 * On 403 with unlockAfter, returns null so the caller can retry.
 * Throws on other errors.
 */
async function unlockSession(sessionId: string): Promise<UnlockResponse | null> {
  const res = await fetch(`${API_BASE}/api/download/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.unlockAfter != null) {
      return null; // Not ready yet — caller should retry
    }
    throw new Error(body.message || "Unlock failed");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `Unlock failed (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

function getStreamUrl(streamToken: string, download = false): string {
  const base = `${API_BASE}/api/download/stream/${streamToken}`;
  return download ? `${base}?download=1` : base;
}

// ─── React Component ───────────────────────────────────────────

function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<SafeVideoMetadata | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamToken, setStreamToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unlockAfter, setUnlockAfter] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setStreamToken(null);
    setSessionId(null);
    try {
      const result = await analyzeUrl(url);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (!selectedFormatId) return;
    setLoading(true);
    setError(null);
    try {
      const session = await startSession(url, selectedFormatId);
      setSessionId(session.sessionId);
      setUnlockAfter(session.unlockAfter);

      // Start countdown, then poll unlock
      setCountdown(session.unlockAfter);
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start polling after the initial wait period
      setTimeout(() => pollUnlock(session.sessionId), session.unlockAfter * 1000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pollUnlock = async (sid: string) => {
    try {
      const result = await unlockSession(sid);
      if (result === null) {
        // Server says not ready yet — retry after 1 second
        setTimeout(() => pollUnlock(sid), 1000);
        return;
      }
      setStreamToken(result.streamToken);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDownload = async () => {
    if (!streamToken) return;

    // Trigger download via stream token
    const a = document.createElement("a");
    a.href = getStreamUrl(streamToken, true);
    a.download = "video.mp4";
    a.click();
  };

  return (
    <div>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste video URL" />
      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      {error && <div className="error">{error}</div>}

      {data && !streamToken && (
        <div className="results">
          <h2>{data.title}</h2>
          <p>{data.author} &middot; {data.duration}s</p>
          <img src={data.thumbnail} alt={data.title} width={200} />

          <h3>Select Format</h3>
          <ul>
            {data.formats.map(f => (
              <li key={f.formatId}>
                <label>
                  <input
                    type="radio"
                    name="format"
                    value={f.formatId}
                    checked={selectedFormatId === f.formatId}
                    onChange={() => setSelectedFormatId(f.formatId)}
                  />
                  {f.quality || f.resolution} ({f.ext})
                  {!f.isAudioAvailable && <span className="no-audio"> No audio</span>}
                </label>
              </li>
            ))}
          </ul>

          <button
            onClick={handleStartSession}
            disabled={loading || !selectedFormatId}
          >
            {!selectedFormatId
              ? "Select a format"
              : countdown > 0
                ? `Wait ${countdown}s...`
                : loading
                  ? "Unlocking..."
                  : "Start Download"}
          </button>
        </div>
      )}

      {streamToken && (
        <div className="stream">
          <h3>Video Ready</h3>
          <video controls width="100%">
            <source src={getStreamUrl(streamToken)} type="video/mp4" />
          </video>
          <button onClick={handleDownload}>Download Video</button>
        </div>
      )}
    </div>
  );
}
```

---

## 5. Error Handling Reference

### HTTP Status Codes

| Status | Meaning | When |
|--------|---------|------|
| `400` | Bad Request | Invalid URL, missing formatId, non-UUID sessionId |
| `403` | Forbidden | Session not yet unlocked (wait and retry) |
| `429` | Rate Limited | Too many requests (default: 20/min per IP) |
| `404` | Not Found | Stream token invalid or expired / format no longer available |
| `500` | Server Error | yt-dlp failed, download failed, etc. |
| `502` | Bad Gateway | Video source fetch failed (CDN unreachable) |
| `504` | Gateway Timeout | Video source timed out |

### All Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/download` | Analyze a URL and list all available formats (no URLs exposed) |
| `POST` | `/api/download/session` | Start an ad-interstitial download session for a specific format (`url` + `formatId`) |
| `POST` | `/api/download/unlock` | Unlock a session after the wait period — returns `selectedFormat` + `streamToken` |
| `GET` | `/api/download/stream/:token` | Stream or download video via a temporary token (supports Range requests) |
| `POST` | `/api/download/format` | Download & stream a specific format via yt-dlp (with optional audio merge) |
| `GET` | `/health` | Health check |

### Common Edge Cases & How to Handle Them

#### Stream token expired (404)

Tokens expire after 5 minutes. If you get a 404:
- Restart the session/unlock flow to get a fresh token
- Don't cache stream tokens client-side for longer than a few minutes

#### TikTok URLs expire quickly

TikTok CDN URLs expire within minutes. The **stream token** endpoint handles this by generating tokens short-lived enough that the upstream URL is still valid. The **format download** endpoint always downloads fresh from the source.

#### Video has no audio (TikTok / Instagram common)

Check `formats[].isAudioAvailable`. If `false`:
- The stream token streams the main video (may play without audio — fine for previews)
- Use the `/api/download/format` endpoint — the server merges audio automatically via ffmpeg

#### Rate limiting (429)

The backend allows 20 requests per minute per IP. If you hit this limit:
- Back off and retry after 1 minute
- Cache analysis results client-side to avoid redundant requests

#### Session unlock retry (403)

If you get a 403 with `unlockAfter`, the server's timer hasn't expired yet (server and client clocks may differ):
- Wait the returned `unlockAfter` seconds and retry the unlock call
- Do not restart the session — the session is still valid and ticking
- Only restart the session on a 404 (session expired/not found)

#### Session expired (404)

The 15-minute session TTL is generous, but if users leave the page open:
- Show a clear "session expired" message
- Automatically restart the flow from `/api/download/session`
- Consider storing the session start time client-side and showing the status

#### Platform not supported

The API returns a 400 error with `"Unsupported content delivery infrastructure destination requested."` when the URL is from an unsupported platform. Supported platforms: **YouTube, TikTok, Instagram, Facebook**.

---

## 6. Quick Start for Testing with curl

```bash
# 1. Analyze a URL
curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123456789"}' | jq .

# 2. Start a download session (pick a formatId from step 1)
SESSION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/download/session \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123456789", "formatId": "0"}')
echo "$SESSION_RESPONSE" | jq .
SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')

# 3. Unlock the session — retry if not ready yet
while true; do
  UNLOCK_RESPONSE=$(curl -s -X POST http://localhost:3000/api/download/unlock \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$SESSION_ID\"}")
  UNLOCK_AFTER=$(echo "$UNLOCK_RESPONSE" | jq -r '.unlockAfter // empty')

  if [ -n "$UNLOCK_AFTER" ] && [ "$UNLOCK_AFTER" != "0" ]; then
    echo "Not yet ready — waiting ${UNLOCK_AFTER}s..."
    sleep "$UNLOCK_AFTER"
  else
    echo "$UNLOCK_RESPONSE" | jq .
    STREAM_TOKEN=$(echo "$UNLOCK_RESPONSE" | jq -r '.data.streamToken')
    break
  fi
done

# 4. Stream the video (plays in browser)
curl -s http://localhost:3000/api/download/stream/$STREAM_TOKEN -o video.mp4

# 5. Download with attachment header
curl -s -OJ "http://localhost:3000/api/download/stream/$STREAM_TOKEN?download=1"

# 6. Download a specific format (server-side, with audio merge)
curl -s -X POST http://localhost:3000/api/download/format \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123456789", "formatId": "0", "isAudioAvailable": false}' \
  -o video.mp4
```
