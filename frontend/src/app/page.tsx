"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import CookieUpload from "@/components/CookieUpload";
import { useCookieStatus } from "@/hooks/useCookieStatus";

axios.defaults.withCredentials = true;

interface SongMeta {
  song_id: string;
  name: string;
}

interface TrackProgress {
  song: SongMeta;
  progress: number;    // 0–100
  message: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackProgress[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const { hasCookies, loading: cookieLoading, refreshStatus } = useCookieStatus();

  // 1️⃣ Fetch CSRF token
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/csrf/`)
      .then((res) => setCsrfToken(res.data.csrfToken))
      .catch(() => console.error("Failed to fetch CSRF token"));
  }, []);

  // 2️⃣ Submit download & seed tracks array
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasCookies || !csrfToken) return;

    const res = await axios.post(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download/`,
      { url },
      { headers: { "X-CSRFToken": csrfToken } }
    );

    const { task_id, songs } = res.data as {
      task_id: string;
      songs: SongMeta[];
    };

    setTaskId(task_id);
    // initialize each track with 0% progress
    setTracks(songs.map((s) => ({ song: s, progress: 0, message: "" })));
  };

  // 3️⃣ Listen for per‐song updates via WebSocket
  useEffect(() => {
    if (!taskId) return;
    const back = process.env.NEXT_PUBLIC_BACKEND_URL!;
    const wsProto = back.startsWith("https") ? "wss" : "ws";
    const ws = new WebSocket(
      `${wsProto}://${back.replace(/^https?:\/\//, "")}/ws/download/${taskId}/`
    );

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);

      if ('download_url' in data) {
        setDownloadUrl(data.download_url);
      } else {
        const update = data as {
          song: SongMeta;
          progress: number;
          message: string;
        };
        // update the matching track’s progress
        setTracks((prev) =>
          prev.map((t) =>
            t.song.song_id === update.song.song_id
              ? { ...t, progress: update.progress, message: update.message }
              : t
          )
        );
      }
    };
    return () => ws.close();
  }, [taskId]);

  const handleCookieChange = () => refreshStatus();

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">SpotDL Downloader</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full p-2 border rounded"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Spotify track/playlist URL"
          required
        />
        <button
          type="submit"
          disabled={!hasCookies || cookieLoading || !csrfToken}
          className={`px-4 py-2 rounded text-white ${!hasCookies || cookieLoading || !csrfToken
            ? "bg-gray-400"
            : "bg-blue-500 hover:bg-blue-600"
            }`}
        >
          Download
        </button>
      </form>

      <CookieUpload onStatusChange={handleCookieChange} csrfToken={csrfToken} />

      {downloadUrl && (
        <div className="mt-4">
          <a
            href={downloadUrl}
            download
            className="text-blue-500 underline"
          >
            Download ZIP
          </a>
        </div>
      )}

      {/* 4️⃣ Render one bar per track */}
      {tracks.map((t) => (
        <div key={t.song.song_id} className="mt-4">
          <p className="font-medium">{t.song.name}</p>
          <progress
            value={t.progress}
            max={100}
            className="w-full h-4"
          />
          <p className="text-sm text-gray-600">{t.message}</p>
        </div>
      ))}
    </div>
  );
}

