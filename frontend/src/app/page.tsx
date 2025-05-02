"use client"

import type React from "react"

import { useState, useEffect } from "react"
import axios from "axios"
import CookieUpload from "@/components/CookieUpload"
import { Music, Download, ArrowRight, Loader2 } from "lucide-react"

axios.defaults.withCredentials = true

interface SongMeta {
  song_id: string
  name: string
}

interface TrackProgress {
  song: SongMeta
  progress: number // 0–100
  message: string
}

export default function Home() {
  const [url, setUrl] = useState("")
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<TrackProgress[]>([])
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [cookiesUploaded, setCookiesUploaded] = useState(false)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [activeCard, setActiveCard] = useState<"cookies" | "url" | "download">("cookies")

  // Fetch CSRF token once on mount
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/csrf/`)
      .then((res) => setCsrfToken(res.data.csrfToken))
      .catch(() => console.error("Failed to fetch CSRF token"))
  }, [])

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!cookiesUploaded) {
      setMessage("Please upload cookies before downloading")
      return
    }
    if (!csrfToken) {
      setMessage("Missing CSRF token")
      return
    }
    setMessage("")
    setDownloadUrl(null)
    setIsLoading(true)

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download/`,
        { url },
        { headers: { "X-CSRFToken": csrfToken } },
      )
      const { task_id, songs } = res.data as {
        task_id: string
        songs: SongMeta[]
      }
      setTaskId(task_id)
      setTracks(songs.map((s) => ({ song: s, progress: 0, message: "" })))
      setActiveCard("download")
    } catch (err) {
      setMessage(axios.isAxiosError(err) ? err.response?.data?.error || "Download failed" : "Unexpected error")
    } finally {
      setIsLoading(false)
    }
  }

  // WebSocket for per‐song progress + final download_url
  useEffect(() => {
    if (!taskId) return
    const back = process.env.NEXT_PUBLIC_BACKEND_URL!
    const wsProto = back.startsWith("https") ? "wss" : "ws"
    const ws = new WebSocket(`${wsProto}://${back.replace(/^https?:\/\//, "")}/ws/download/${taskId}/`)

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data)

      if ("download_url" in data) {
        setDownloadUrl(data.download_url)
        return
      }

      const update = data as {
        song: SongMeta
        progress: number
        message: string
      }
      // update the matching track's progress
      setTracks((prev) =>
        prev.map((t) =>
          t.song.song_id === update.song.song_id ? { ...t, progress: update.progress, message: update.message } : t,
        ),
      )
    }

    ws.onerror = () => {
      console.error("WebSocket error")
      setMessage("WebSocket connection error")
    }

    return () => {
      ws.close()
    }
  }, [taskId])

  const handleCookieUploadSuccess = () => {
    setCookiesUploaded(true)
    setActiveCard("url")
  }

  return (
    <div className="min-h-screen bg-spotify-green p-4 md:p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-6xl bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-full bg-spotify-green flex items-center justify-center">
              <Music className="h-5 w-5 text-black" />
            </div>
            <span className="text-white font-bold">SPOTDL WEB</span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <span className="text-zinc-400 text-sm">DOWNLOAD</span>
            <span className="text-zinc-400 text-sm">ABOUT</span>
            <span className="text-zinc-400 text-sm">HELP</span>
          </div>

          <div className="bg-spotify-green px-4 py-1 rounded-full">
            <span className="text-black text-sm font-bold">WEB APP</span>
          </div>
        </div>

        {/* Hero */}
        <div className="px-6 py-12 md:py-16 flex flex-col items-center">
          <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tighter mb-2">
            DOWNLOAD <span className="text-spotify-green">MUSIC</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl text-center mb-8">
            Get your favorite Spotify tracks and playlists in high quality MP3 format
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
          {/* Cookie Upload Card */}
          <div
            className={`rounded-2xl overflow-hidden ${activeCard === "cookies" ? "bg-spotify-green" : "bg-zinc-800"
              } p-6 flex flex-col ${activeCard === "cookies" ? "" : "cursor-pointer"}`}
            onClick={() => cookiesUploaded && setActiveCard("cookies")}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className={`text-3xl font-bold ${activeCard === "cookies" ? "text-black" : "text-white"}`}>
                UPLOAD COOKIES
              </h2>
              <span className={`text-sm ${activeCard === "cookies" ? "text-black/70" : "text-zinc-400"}`}>STEP 1</span>
            </div>

            {activeCard === "cookies" ? (
              <div className="flex-grow">
                <CookieUpload csrfToken={csrfToken} onStatusChange={handleCookieUploadSuccess} />
              </div>
            ) : (
              <>
                <p className={`text-lg mb-6 ${cookiesUploaded ? "text-green-400" : "text-zinc-400"}`}>
                  {cookiesUploaded ? "✓ Cookies uploaded successfully" : "Upload your Spotify cookies file"}
                </p>
                <div className="mt-auto">
                  <button
                    className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                    aria-label="Go to cookie upload"
                  >
                    <ArrowRight className="h-5 w-5 text-white" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* URL Input Card */}
          <div
            className={`rounded-2xl overflow-hidden ${activeCard === "url" ? "bg-spotify-light" : "bg-zinc-800"
              } p-6 flex flex-col ${cookiesUploaded && activeCard !== "url" ? "cursor-pointer" : ""}`}
            onClick={() => cookiesUploaded && setActiveCard("url")}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className={`text-3xl font-bold ${activeCard === "url" ? "text-black" : "text-white"}`}>ENTER URL</h2>
              <span className={`text-sm ${activeCard === "url" ? "text-black/70" : "text-zinc-400"}`}>STEP 2</span>
            </div>

            {activeCard === "url" ? (
              <div className="flex-grow">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    className="w-full p-3 bg-black/20 border-2 border-black/30 rounded-xl text-black placeholder-black/50 focus:outline-none focus:border-black"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Spotify track/playlist URL"
                    required
                  />

                  <button
                    type="submit"
                    disabled={!cookiesUploaded || !csrfToken || isLoading}
                    className={`w-full p-3 rounded-xl text-white font-bold flex items-center justify-center space-x-2 ${!cookiesUploaded || !csrfToken || isLoading
                      ? "bg-black/20 cursor-not-allowed"
                      : "bg-black hover:bg-black/80"
                      }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Download size={20} />
                        <span>DOWNLOAD</span>
                      </>
                    )}
                  </button>
                </form>

                {message && (
                  <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50">
                    <p className="text-black">{message}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-lg mb-6 text-zinc-400">
                  {taskId ? "URL submitted for download" : "Enter your Spotify URL"}
                </p>
                <div className="mt-auto">
                  <button
                    className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                    aria-label="Go to URL input"
                    disabled={!cookiesUploaded}
                  >
                    <ArrowRight className="h-5 w-5 text-white" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Download Card */}
          <div
            className={`rounded-2xl overflow-hidden ${activeCard === "download" ? "bg-spotify-accent" : "bg-zinc-800"
              } p-6 flex flex-col ${taskId && activeCard !== "download" ? "cursor-pointer" : ""}`}
            onClick={() => taskId && setActiveCard("download")}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className={`text-3xl font-bold ${activeCard === "download" ? "text-black" : "text-white"}`}>
                DOWNLOAD
              </h2>
              <span className={`text-sm ${activeCard === "download" ? "text-black/70" : "text-zinc-400"}`}>STEP 3</span>
            </div>

            {activeCard === "download" ? (
              <div className="flex-grow">
                {tracks.length > 0 ? (
                  <div className="space-y-4">
                    {tracks.map((t) => (
                      <div key={t.song.song_id} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <p
                            className={`font-medium ${activeCard === "download" ? "text-black" : "text-white"} truncate`}
                          >
                            {t.song.name}
                          </p>
                          <span className={`text-sm ${activeCard === "download" ? "text-black/70" : "text-zinc-400"}`}>
                            {t.progress}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-black/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-black transition-all duration-300 ease-out"
                            style={{ width: `${t.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="animate-spin text-black" size={32} />
                  </div>
                )}

                {downloadUrl && (
                  <div className="mt-6 p-4 bg-black/10 rounded-xl flex flex-col items-center space-y-3">
                    <p className="text-black font-bold">Your download is ready!</p>
                    <a
                      href={downloadUrl}
                      download
                      className="px-6 py-2 bg-black text-white font-bold rounded-xl flex items-center space-x-2"
                    >
                      <Download size={18} />
                      <span>DOWNLOAD ZIP</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-lg mb-6 text-zinc-400">
                  {downloadUrl ? "Your download is ready" : "Track download progress"}
                </p>
                <div className="mt-auto">
                  <button
                    className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                    aria-label="Go to download"
                    disabled={!taskId}
                  >
                    <ArrowRight className="h-5 w-5 text-white" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-800 flex justify-between items-center">
          <p className="text-zinc-500 text-sm">© 2025 SpotDL Web • GUI for <a href="https://github.com/spotDL/spotify-downloader">spotDL</a></p>
          <div className="flex space-x-4">
            <a href="https://github.com/jwolley9701gh/spotdl-web" className="text-zinc-400 hover:text-white">
              GitHub
            </a>
            <a href="#" className="text-zinc-400 hover:text-white">
              Docs
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
