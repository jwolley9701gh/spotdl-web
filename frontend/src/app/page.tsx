"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import CookieUpload from "@/components/CookieUpload";

axios.defaults.withCredentials = true;

interface SongMeta {
  song_id: string;
  name: string;
}

interface TrackProgress {
  song: SongMeta;
  progress: number; // 0–100
  message: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackProgress[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [cookiesUploaded, setCookiesUploaded] = useState(false);
  const [message, setMessage] = useState("");

  // 1️⃣ Fetch CSRF token once on mount
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/csrf/`)
      .then((res) => setCsrfToken(res.data.csrfToken))
      .catch(() => console.error("Failed to fetch CSRF token"));
  }, []);

  // 2️⃣ Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cookiesUploaded) {
      setMessage("Please upload cookies before downloading");
      return;
    }
    if (!csrfToken) {
      setMessage("Missing CSRF token");
      return;
    }
    setMessage("");
    setDownloadUrl(null);

    try {
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
      setTracks(
        songs.map((s) => ({ song: s, progress: 0, message: "" }))
      );
    } catch (err) {
      setMessage(
        axios.isAxiosError(err)
          ? err.response?.data?.error || "Download failed"
          : "Unexpected error"
      );
    }
  };

  // 3️⃣ WebSocket for per‐song progress + final download_url
  useEffect(() => {
    if (!taskId) return;
    const back = process.env.NEXT_PUBLIC_BACKEND_URL!;
    const wsProto = back.startsWith("https") ? "wss" : "ws";
    const ws = new WebSocket(
      `${wsProto}://${back.replace(/^https?:\/\//, "")}/ws/download/${taskId}/`
    );

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);

      // console.log("WebSocket message:", data);

      if ('download_url' in data) {
        setDownloadUrl(data.download_url);
        return;
      }

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
    };

    ws.onerror = () => {
      console.error("WebSocket error");
      setMessage("WebSocket connection error");
    };

    return () => {
      ws.close();
    };
  }, [taskId]);

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">SpotDL Downloader</h1>

      {/* Prompt until cookies have been uploaded */}
      {!cookiesUploaded && (
        <p className="mb-4 text-yellow-600">
          Please upload cookies before downloading
        </p>
      )}

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
          disabled={!cookiesUploaded || !csrfToken}
          className={`px-4 py-2 rounded text-white ${!cookiesUploaded || !csrfToken
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-500 hover:bg-blue-600"
            }`}
        >
          Download
        </button>
      </form>

      {/* Cookie upload component */}
      <CookieUpload
        csrfToken={csrfToken}
        onStatusChange={() => setCookiesUploaded(true)}
      />

      {/* Final download link */}
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

      {/* One progress bar per track */}
      {tracks.map((t) => (
        <div key={t.song.song_id} className="mt-4">
          <p className="font-medium">{t.song.name}</p>
          <progress value={t.progress} max={100} className="w-full h-4" />
          <p className="text-sm text-gray-600">{t.message}</p>
        </div>
      ))}

      {/* General message (errors, etc.) */}
      {message && (
        <p
          className={`mt-4 ${message.toLowerCase().includes("error")
            ? "text-red-600"
            : "text-green-600"
            }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
