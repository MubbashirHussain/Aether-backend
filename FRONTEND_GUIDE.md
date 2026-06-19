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
    "videoUrl": "https://cdn.direct.url/video.mp4",
    "formats": [
      {
        "formatId": "0",
        "ext": "mp4",
        "resolution": "720x1280",
        "url": "https://cdn.direct.url/format_0.mp4",
        "filesize": 5242880,
        "quality": "720p",
        "urlTested": true,
        "urlWorking": true,
        "isAudioAvailable": true
      },
      {
        "formatId": "1",
        "ext": "mp4",
        "resolution": "480x854",
        "url": "https://cdn.direct.url/format_1.mp4",
        "filesize": 2097152,
        "quality": "480p",
        "urlTested": true,
        "urlWorking": true,
        "isAudioAvailable": true
      }
    ]
  }
}
```

#### New Fields Explained

| Field | Type | Description |
|-------|------|-------------|
| `formats[].urlTested` | `boolean` | Whether the backend tested this URL with a HEAD request. `false` means the URL was not tested (usually because testing was skipped for performance). |
| `formats[].urlWorking` | `boolean` | Whether the URL responded with a successful HTTP status. **Only trust this when `urlTested` is `true`.** |
| `formats[].isAudioAvailable` | `boolean` | Whether this specific format contains an audio stream. `false` means the format is video-only. |

#### Client-Side Handling for `urlTested` / `urlWorking`

Some CDN URLs (especially TikTok, Instagram) expire quickly. The backend tests each format URL with a HEAD request. Here's how to use these fields:

```typescript
interface FormatItem {
  formatId: string;
  ext: string;
  resolution: string;
  url: string;
  filesize?: number;
  quality?: string;
  urlTested: boolean;
  urlWorking: boolean;
  isAudioAvailable: boolean;
}

function selectWorkingFormat(formats: FormatItem[]): FormatItem | null {
  // Prefer formats that were tested and are working
  const working = formats.filter(f => f.urlTested && f.urlWorking);
  if (working.length > 0) {
    // Among working formats, pick the highest quality
    return working.reduce((best, f) =>
      (f.filesize || 0) > (best.filesize || 0) ? f : best
    );
  }

  // If no working format found, try untested formats
  // (they might still work — testing can fail for rate-limiting reasons)
  const untested = formats.filter(f => !f.urlTested);
  if (untested.length > 0) {
    console.warn("No formats confirmed working, falling back to untested formats");
    return untested.reduce((best, f) =>
      (f.filesize || 0) > (best.filesize || 0) ? f : best
    );
  }

  // All formats failed testing — user needs to re-analyze
  return null;
}
```

---

## 2. Download with Ad Interstitial Flow

This flow shows an ad before allowing the download.

### Step 2a: Start a Session

```
POST /api/download/session
Content-Type: application/json

{
  "url": "https://www.tiktok.com/@user/video/123456789"
}
```

**Response:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "unlockAfter": 5
}
```

- `unlockAfter`: seconds to wait before the download is unlocked
- Session expires after 15 minutes of inactivity

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
    "platform": "tiktok",
    "id": "123456789",
    "title": "Video Title",
    "formats": [
      // ... same format objects as /api/download
    ]
  }
}
```

**Error Response (403):**

```json
{
  "success": false,
  "message": "Verification lease pending or session unfulfilled."
}
```

---

## 3. Server-Side Download (with Audio Merge)

Use this endpoint when you want the server to download the media and stream it directly to the client. This solves two problems:
1. **Expired URLs** — The server downloads fresh from the source
2. **Missing audio** — If a format has no audio, the server merges the best audio stream using ffmpeg

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

### When to Use Direct URL vs Server Download

| Scenario | Use |
|----------|-----|
| `urlTested: true` and `urlWorking: true` | Direct URL (play in `<video>` or download via `fetch`) |
| `urlTested: true` and `urlWorking: false` | Server download endpoint (`/api/download/format`) |
| `urlTested: false` | Try direct URL first. If it fails, fall back to server download |
| `isAudioAvailable: false` and ffmpeg is available | Server download endpoint will auto-merge audio |
| `isAudioAvailable: false` and no ffmpeg | Direct URL only. Video will play without audio |

---

## 4. Complete Integration Example (React/TypeScript)

```typescript
import { useState } from "react";

interface FormatItem {
  formatId: string;
  ext: string;
  resolution: string;
  url: string;
  filesize?: number;
  quality?: string;
  urlTested: boolean;
  urlWorking: boolean;
  isAudioAvailable: boolean;
}

interface VideoData {
  platform: string;
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  videoUrl: string;
  formats: FormatItem[];
}

const API_BASE = "http://localhost:3000";

async function analyzeUrl(url: string): Promise<VideoData> {
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

function pickBestFormat(formats: FormatItem[]): FormatItem | null {
  // Priority: working > tested > untested
  const working = formats.filter(f => f.urlTested && f.urlWorking);
  if (working.length > 0) {
    return working.reduce((a, b) => ((a.filesize || 0) > (b.filesize || 0) ? a : b));
  }
  const untested = formats.filter(f => !f.urlTested);
  if (untested.length > 0) {
    return untested.reduce((a, b) => ((a.filesize || 0) > (b.filesize || 0) ? a : b));
  }
  return formats[0] || null;
}

function canPlayDirectly(format: FormatItem): boolean {
  return format.urlTested && format.urlWorking;
}

function downloadUrl({ url, formatId, isAudioAvailable }: {
  url: string;
  formatId: string;
  isAudioAvailable: boolean;
}): string {
  return `${API_BASE}/api/download/format`;
}

async function downloadViaServer(url: string, format: FormatItem): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/download/format`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formatId: format.formatId,
      isAudioAvailable: format.isAudioAvailable,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `Download failed (${res.status})`);
  }

  return res.blob();
}

// ─── React Component ───────────────────────────────────────────

function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeUrl(url);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: FormatItem) => {
    if (canPlayDirectly(format)) {
      // Direct download — open in new tab or use <a> tag
      window.open(format.url, "_blank");
    } else {
      // Server-side download (handles expired URLs + audio merge)
      try {
        const blob = await downloadViaServer(url, format);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `video.${format.ext}`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      } catch (e: any) {
        setError(e.message);
      }
    }
  };

  return (
    <div>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste video URL" />
      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      {error && <div className="error">{error}</div>}

      {data && (
        <div className="results">
          <h2>{data.title}</h2>
          <p>{data.author} &middot; {data.duration}s</p>
          <img src={data.thumbnail} alt={data.title} width={200} />

          <h3>Available Formats</h3>
          <ul>
            {data.formats.map(f => (
              <li key={f.formatId}>
                {f.quality || f.resolution} ({f.ext})
                {!f.isAudioAvailable && <span className="no-audio"> No audio</span>}
                {f.urlTested && !f.urlWorking && <span className="expired"> URL expired</span>}
                <button onClick={() => handleDownload(f)}>Download</button>
              </li>
            ))}
          </ul>
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
| `404` | Not Found | Format no longer available on CDN |
| `500` | Server Error | yt-dlp failed, download failed, etc. |

### All Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/download` | Analyze a URL and list all available formats |
| `POST` | `/api/download/session` | Start an ad-interstitial download session |
| `POST` | `/api/download/unlock` | Unlock a session after the wait period |
| `POST` | `/api/download/format` | Download & stream a specific format (with optional audio merge) |
| `GET` | `/health` | Health check |

### Common Edge Cases & How to Handle Them

#### TikTok URLs expire quickly

TikTok CDN URLs often become invalid within minutes. The `urlTested` / `urlWorking` fields tell you immediately if a URL is still valid. **Always check these fields before using a direct URL.** If a URL has expired, use the `/api/download/format` endpoint instead — the server downloads fresh from the source.

#### Video has no audio (TikTok / Instagram common)

Check `formats[].isAudioAvailable`. If `false`:
- Option A: Use the `/api/download/format` endpoint — the server merges audio automatically (requires ffmpeg on the server)
- Option B: Play the video directly (it will play without audio — fine for previews)

#### Rate limiting (429)

The backend allows 20 requests per minute per IP. If you hit this limit:
- Back off and retry after 1 minute
- Cache analysis results client-side to avoid redundant requests

#### Session expired (403)

The 15-minute session TTL is generous, but if users leave the page open:
- Show a clear "session expired" message
- Automatically restart the flow from `/api/download/session`
- Consider storing the session start time client-side and showing the status

#### All formats have `urlWorking: false`

This means the CDN URLs have all expired. The user should:
1. Re-analyze the URL (fresh yt-dlp call = fresh CDN URLs)
2. Use the `/api/download/format` endpoint for server-side download

#### Platform not supported

The API returns a 400 error with `"Unsupported content delivery infrastructure destination requested."` when the URL is from an unsupported platform. Supported platforms: **YouTube, TikTok, Instagram, Facebook**.

---

## 6. Quick Start for Testing with curl

```bash
# 1. Analyze a URL
curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123456789"}' | jq .

# 2. Start a download session
curl -s -X POST http://localhost:3000/api/download/session \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123456789"}' | jq .

# 3. Unlock the session (wait 5 seconds first)
curl -s -X POST http://localhost:3000/api/download/unlock \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "SESSION_ID_FROM_STEP_2"}' | jq .

# 4. Download a specific format (server-side, with audio merge)
curl -s -X POST http://localhost:3000/api/download/format \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@user/video/123456789", "formatId": "0", "isAudioAvailable": false}' \
  -o video.mp4
```
