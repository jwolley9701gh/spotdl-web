"use client"

import type React from "react"

import { useState, useEffect } from "react"
import axios from "axios"
import CookieUpload from "@/components/CookieUpload"
import { Download, ArrowRight, Loader2, AlertCircle, AudioLines, Music, Check } from "lucide-react"

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

type AudioFormat = "mp3" | "ogg" | "m4a"

// URL validation patterns
const SPOTIFY_URL_PATTERN =
  /^(https?:\/\/)?(open\.spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+|spotify:(track|album|playlist|artist):[a-zA-Z0-9]+)(\?.*)?$/
const YOUTUBE_URL_PATTERN =
  /^(https?:\/\/)?((www|m)\.)?((youtube\.com\/watch\?v=)|(youtu\.be\/))([a-zA-Z0-9_-]+)(\?.*|&.*)?$/

// Function to sanitize YouTube URL
const sanitizeYoutubeUrl = (url: string): string => {
  try {
    // Handle youtu.be format
    if (url.includes("youtu.be/")) {
      const videoId = url.split("youtu.be/")[1].split(/[?&]/)[0]
      return `https://www.youtube.com/watch?v=${videoId}`
    }

    // Handle youtube.com format
    if (url.includes("youtube.com/watch")) {
      // Make sure the URL has a protocol
      const fullUrl = url.startsWith("http") ? url : `https://${url}`
      const urlObj = new URL(fullUrl)
      const videoId = urlObj.searchParams.get("v")
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`
      }
    }

    // If we couldn't parse it properly, return the original URL
    return url
  } catch (error) {
    console.error("Error sanitizing YouTube URL:", error)
    return url
  }
}

export default function Home() {
  const [url, setUrl] = useState("")
  const [spotifyUrl, setSpotifyUrl] = useState("")
  const [isYoutubeUrl, setIsYoutubeUrl] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<TrackProgress[]>([])
  const [downloadUrls, setDownloadUrls] = useState<string[]>([])
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null)
  const [cookiesUploaded, setCookiesUploaded] = useState(false)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [activeCard, setActiveCard] = useState<"cookies" | "url" | "download">("cookies")
  const [urlError, setUrlError] = useState<string | null>(null)
  const [spotifyUrlError, setSpotifyUrlError] = useState<string | null>(null)
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3")

  // Fetch CSRF token once on mount
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/csrf/`)
      .then((res) => setCsrfToken(res.data.csrfToken))
      .catch(() => console.error("Failed to fetch CSRF token"))
  }, [])

  // Check if URL is YouTube and update state accordingly
  useEffect(() => {
    const trimmedUrl = url.trim()
    if (YOUTUBE_URL_PATTERN.test(trimmedUrl)) {
      setIsYoutubeUrl(true)
    } else {
      setIsYoutubeUrl(false)
      setSpotifyUrl("")
      setSpotifyUrlError(null)
    }
  }, [url])

  // Validate URL input
  const validateUrl = (
    input: string,
    pattern: RegExp,
    errorSetter: React.Dispatch<React.SetStateAction<string | null>>,
    errorMessage: string,
  ): boolean => {
    // Trim and sanitize the input
    const sanitizedUrl = input.trim()

    if (!sanitizedUrl) {
      errorSetter("Please enter a URL")
      return false
    }

    // Check if it's a valid URL according to the pattern
    if (!pattern.test(sanitizedUrl)) {
      errorSetter(errorMessage)
      return false
    }

    errorSetter(null)
    return true
  }

  // Handle URL input change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)

    // Clear error when user starts typing again
    if (urlError) {
      setUrlError(null)
    }
  }

  // Handle Spotify URL input change
  const handleSpotifyUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setSpotifyUrl(newUrl)

    // Clear error when user starts typing again
    if (spotifyUrlError) {
      setSpotifyUrlError(null)
    }
  }

  // Handle format change
  const handleFormatChange = (format: AudioFormat) => {
    setAudioFormat(format)
  }

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

    // Validate primary URL
    const isMainUrlValid = validateUrl(
      url,
      isYoutubeUrl ? YOUTUBE_URL_PATTERN : SPOTIFY_URL_PATTERN,
      setUrlError,
      isYoutubeUrl ? "Please enter a valid YouTube URL" : "Please enter a valid Spotify URL",
    )

    if (!isMainUrlValid) {
      return
    }

    // If YouTube URL, validate Spotify URL as well
    let finalUrl = url.trim()
    if (isYoutubeUrl) {
      const isSpotifyUrlValid = validateUrl(
        spotifyUrl,
        SPOTIFY_URL_PATTERN,
        setSpotifyUrlError,
        "Please enter a valid Spotify URL",
      )

      if (!isSpotifyUrlValid) {
        return
      }

      // Sanitize YouTube URL to remove unnecessary parameters
      const sanitizedYoutubeUrl = sanitizeYoutubeUrl(finalUrl)

      // Combine YouTube and Spotify URLs with a pipe character
      finalUrl = `${sanitizedYoutubeUrl}|${spotifyUrl.trim()}`
    }

    setMessage("")
    setDownloadUrls([])
    setIsLoading(true)

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download/`,
        {
          url: finalUrl,
          format: audioFormat,
        },
        {
          headers: {
            "X-CSRFToken": csrfToken,
            "Content-Type": "application/json",
          },
        },
      )

      // Validate response data
      if (!res.data || !res.data.task_id || !Array.isArray(res.data.songs)) {
        throw new Error("Invalid response from server")
      }

      const { task_id, songs } = res.data as {
        task_id: string
        songs: SongMeta[]
      }

      setTaskId(task_id)
      setTracks(songs.map((s) => ({ song: s, progress: 0, message: "" })))
      setActiveCard("download")
    } catch (err) {
      console.error("Download error:", err)
      setMessage(axios.isAxiosError(err) ? err.response?.data?.error || "Download failed" : "Unexpected error")
    } finally {
      setIsLoading(false)
    }
  }

  // Polling for per‐song progress + final download_urls
  useEffect(() => {
    if (!taskId) return

    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download-status/${taskId}/`)

        if (data.download_urls) {
          // convert json to array
          clearInterval(interval)
          const downloadUrls: string[] = Object.values(JSON.parse(data.download_urls))
          setDownloadUrls(downloadUrls)
        }

        const songs: Array<{
          id: string
          name: string
          progress: number
          message: string
        }> = data.songs

        // 2) update each track's progress/message
        setTracks(
          songs.map((s) => ({
            song: { song_id: s.id, name: s.name },
            progress: s.progress,
            message: s.message,
          })),
        )
      } catch (err) {
        console.error("Polling error:", err)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [taskId])

  const handleCookieUploadSuccess = () => {
    setCookiesUploaded(true)
    setActiveCard("url")
  }

  const handleDownload = (zipName: string, index: number) => {
    console.log("Downloading:", zipName)
    setDownloadingIndex(index)
    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download-zip/${zipName}`, { responseType: "blob" })
      .then((response) => {
        const blob = new Blob([response.data], { type: "application/zip" })
        const link = document.createElement("a")
        link.href = URL.createObjectURL(blob)
        link.download = zipName.split("/").pop() || "download.zip"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setDownloadingIndex(null)
      })
      .catch((err) => {
        console.error("Download error:", err)
        setDownloadingIndex(null)
      })
  }

  return (
    <div className="min-h-screen bg-spotify-green p-4 md:p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-6xl bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800">
        {/* Header */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-spotify-green flex items-center justify-center">
              <AudioLines className="h-5 w-5 text-black" />
            </div>
            <span className="text-white font-bold">SPOTDL WEB</span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <span className="text-zinc-400 text-sm">DOWNLOAD</span>
            <span className="text-zinc-400 text-sm">ABOUT</span>
            <span className="text-zinc-400 text-sm">HELP</span>
          </div>
        </div>

        {/* Hero */}
        <div className="px-6 py-12 md:py-16 flex flex-col items-center">
          <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tighter text-center mb-2">
            DOWNLOAD <span className="text-spotify-green">MUSIC</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl text-center mb-8">
            Get your favorite Spotify tracks and playlists in MP3 format
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
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full ${activeCard === "cookies" ? "bg-black text-white" : "bg-zinc-700 text-zinc-400"
                  } font-bold text-sm`}
              >
                1
              </span>
            </div>

            {activeCard === "cookies" ? (
              <div className="flex-grow">
                <CookieUpload csrfToken={csrfToken} onStatusChange={handleCookieUploadSuccess} />
              </div>
            ) : (
              <>
                <p className={`text-lg mb-6 ${cookiesUploaded ? "text-green-400" : "text-zinc-400"}`}>
                  {cookiesUploaded ? "✓ Cookies uploaded successfully" : "Upload your cookies file"}
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
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full ${activeCard === "url" ? "bg-black text-white" : "bg-zinc-700 text-zinc-400"
                  } font-bold text-sm`}
              >
                2
              </span>
            </div>

            {activeCard === "url" ? (
              <div className="flex-grow">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      {isYoutubeUrl ? (
                        <Music className="h-4 w-4 text-black/70" />
                      ) : (
                        <AudioLines className="h-4 w-4 text-black/70" />
                      )}
                      <label htmlFor="url" className="text-sm font-medium text-black/70">
                        {isYoutubeUrl ? "YouTube URL" : "Spotify/YouTube URL"}
                      </label>
                    </div>
                    <input
                      id="url"
                      className={`w-full p-3 bg-black/20 border-2 ${urlError ? "border-red-500" : "border-black/30"
                        } rounded-xl text-black placeholder-black/50 focus:outline-none focus:border-black`}
                      value={url}
                      onChange={handleUrlChange}
                      placeholder={isYoutubeUrl ? "YouTube Music URL" : "Spotify or YouTube URL"}
                      required
                      aria-invalid={urlError ? "true" : "false"}
                      aria-describedby={urlError ? "url-error" : undefined}
                    />
                    {urlError && (
                      <div id="url-error" className="mt-2 flex items-center text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {urlError}
                      </div>
                    )}
                  </div>

                  {isYoutubeUrl && (
                    <div className="mt-4">
                      <div className="flex items-center space-x-2 mb-1">
                        <AudioLines className="h-4 w-4 text-black/70" />
                        <label htmlFor="spotify-url" className="text-sm font-medium text-black/70">
                          Corresponding Spotify URL
                        </label>
                      </div>
                      <input
                        id="spotify-url"
                        className={`w-full p-3 bg-black/20 border-2 ${spotifyUrlError ? "border-red-500" : "border-black/30"
                          } rounded-xl text-black placeholder-black/50 focus:outline-none focus:border-black`}
                        value={spotifyUrl}
                        onChange={handleSpotifyUrlChange}
                        placeholder="Enter the corresponding Spotify URL"
                        required
                        aria-invalid={spotifyUrlError ? "true" : "false"}
                        aria-describedby={spotifyUrlError ? "spotify-url-error" : undefined}
                      />
                      {spotifyUrlError && (
                        <div id="spotify-url-error" className="mt-2 flex items-center text-sm text-red-600">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          {spotifyUrlError}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-black/70">
                        For YouTube URLs, we need the corresponding Spotify URL to fetch accurate metadata.
                      </p>
                    </div>
                  )}

                  {/* Format Selection */}
                  <div className="mt-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <label className="text-sm font-medium text-black/70">Audio Format</label>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => handleFormatChange("mp3")}
                        className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-1 transition-colors ${audioFormat === "mp3" ? "bg-black text-white" : "bg-black/20 text-black hover:bg-black/30"
                          }`}
                      >
                        {audioFormat === "mp3" && <Check size={16} className="mr-1" />}
                        <span>MP3</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFormatChange("ogg")}
                        className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-1 transition-colors ${audioFormat === "ogg" ? "bg-black text-white" : "bg-black/20 text-black hover:bg-black/30"
                          }`}
                      >
                        {audioFormat === "ogg" && <Check size={16} className="mr-1" />}
                        <span>OGG</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFormatChange("m4a")}
                        className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-1 transition-colors ${audioFormat === "m4a" ? "bg-black text-white" : "bg-black/20 text-black hover:bg-black/30"
                          }`}
                      >
                        {audioFormat === "m4a" && <Check size={16} className="mr-1" />}
                        <span>M4A</span>
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-black/70">
                      {audioFormat === "mp3"
                        ? "MP3: Universal compatibility with all devices and players"
                        : audioFormat === "ogg"
                          ? "OGG: Better audio quality at smaller file sizes"
                          : "M4A: High quality audio with good compression (Apple format)"}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={!cookiesUploaded || !csrfToken || isLoading || (isYoutubeUrl && !spotifyUrl)}
                    className={`w-full p-3 rounded-xl text-white font-bold flex items-center justify-center space-x-2 ${!cookiesUploaded || !csrfToken || isLoading || (isYoutubeUrl && !spotifyUrl)
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
                        <span>DOWNLOAD {audioFormat.toUpperCase()}</span>
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
                  {taskId ? "URL submitted for download" : "Enter your music URL"}
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
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full ${activeCard === "download" ? "bg-black text-white" : "bg-zinc-700 text-zinc-400"
                  } font-bold text-sm`}
              >
                3
              </span>
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

                {downloadUrls.length > 0 && (
                  <div className="mt-6 p-4 bg-black/10 rounded-xl flex flex-col items-center space-y-3">
                    <p className="text-black font-bold">
                      Your {audioFormat.toUpperCase()} download{downloadUrls.length > 1 ? "s are" : " is"} ready!
                    </p>

                    {downloadUrls.length === 1 ? (
                      <button
                        onClick={() => handleDownload(downloadUrls[0], 0)}
                        disabled={downloadingIndex !== null}
                        className="px-6 py-2 bg-black text-white font-bold rounded-xl flex items-center justify-center space-x-2"
                      >
                        {downloadingIndex === 0 ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <Download size={18} />
                        )}
                        <span>DOWNLOAD</span>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {downloadUrls.map((url, index) => {
                          return (
                            <button
                              key={url}
                              onClick={() => handleDownload(url, index)}
                              disabled={downloadingIndex !== null}
                              className="px-6 py-2 bg-black text-white font-bold rounded-xl flex items-center justify-center space-x-2 hover:bg-black/80 transition-colors"
                            >
                              {downloadingIndex === index ? (
                                <Loader2 className="animate-spin" size={18} />
                              ) : (
                                <Download size={18} />
                              )}
                              <span>
                                PART {index + 1} OF {downloadUrls.length}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-lg mb-6 text-zinc-400">
                  {downloadUrls.length > 0 ? "Your download is ready" : "Track download progress"}
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
          <p className="text-zinc-500 text-sm">
            © 2025 SpotDL Web • GUI for{" "}
            <a
              href="https://github.com/spotDL/spotify-downloader"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              spotDL
            </a>
          </p>
          <div className="flex space-x-4">
            <a
              href="https://github.com/jwolley9701gh/spotdl-web"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white"
            >
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
