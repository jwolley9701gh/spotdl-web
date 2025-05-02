"use client"

import { useState, type ChangeEvent } from "react"
import axios from "axios"
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

interface CookieUploadProps {
    csrfToken: string | null
    onStatusChange?: () => void
}

const CookieUpload = ({ csrfToken, onStatusChange }: CookieUploadProps) => {
    const [file, setFile] = useState<File | null>(null)
    const [message, setMessage] = useState<string>("")
    const [isUploading, setIsUploading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0])
            setMessage("")
            setIsSuccess(false)
        }
    }

    const handleUpload = async () => {
        if (!file) {
            setMessage("Please select a file first")
            return
        }
        if (!csrfToken) {
            setMessage("CSRF token not available. Please refresh and try again.")
            return
        }

        setIsUploading(true)
        const formData = new FormData()
        formData.append("cookie_file", file)

        try {
            await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/upload-cookies/`, formData, {
                headers: { "X-CSRFToken": csrfToken },
                withCredentials: true,
            })
            setMessage("Cookie file uploaded successfully")
            setFile(null)
            setIsSuccess(true)
            onStatusChange?.()
        } catch (err) {
            console.error("Cookie upload error:", err)
            setMessage(
                axios.isAxiosError(err)
                    ? err.response?.data?.error || "Error uploading cookie file"
                    : "Unexpected error uploading cookie file",
            )
            setIsSuccess(false)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="p-4 border-2 border-dashed border-black/30 rounded-xl bg-black/10 flex flex-col items-center justify-center">
                <Upload className="h-10 w-10 text-black/70 mb-3" />
                <p className="text-black font-medium mb-1">Upload your cookies file</p>
                <p className="text-black/70 text-sm mb-4 text-center">This is required to download tracks from Youtube Music</p>

                <label className="relative cursor-pointer bg-black text-white font-bold py-2 px-4 rounded-xl">
                    {file ? "Change File" : "Select File"}
                    <input type="file" onChange={handleFileChange} accept=".txt" className="sr-only" />
                </label>

                {file && (
                    <div className="mt-4 flex items-center space-x-2 text-black">
                        <CheckCircle className="text-black" size={16} />
                        <span>{file.name}</span>
                    </div>
                )}
            </div>

            {file && !isSuccess && (
                <button
                    onClick={handleUpload}
                    disabled={!csrfToken || isUploading}
                    className={`w-full px-4 py-3 rounded-xl text-white font-bold flex items-center justify-center space-x-2 ${!csrfToken || isUploading ? "bg-black/50 cursor-not-allowed" : "bg-black hover:bg-black/80"
                        }`}
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            <span>Uploading...</span>
                        </>
                    ) : (
                        <>
                            <Upload size={20} />
                            <span>UPLOAD COOKIES</span>
                        </>
                    )}
                </button>
            )}

            {isSuccess && (
                <div className="p-4 bg-black/10 border border-black/20 rounded-xl flex items-center space-x-3">
                    <CheckCircle className="text-black flex-shrink-0" size={24} />
                    <div>
                        <p className="text-black font-bold">Cookies uploaded successfully!</p>
                        <p className="text-black/70 text-sm">You can now proceed to the next step</p>
                    </div>
                </div>
            )}

            {message && !isSuccess && (
                <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center space-x-3">
                    <AlertCircle className="text-red-500 flex-shrink-0" size={24} />
                    <p className="text-black">{message}</p>
                </div>
            )}

            <div className="mt-2 p-4 bg-black/10 rounded-xl">
                <h3 className="text-black font-bold mb-2">How to get Youtube Music cookies</h3>
                <ol className="list-decimal list-inside text-black/70 space-y-1 text-sm">
                    <li>Log in to Youtube Music in your browser</li>
                    <li>
                        Install the
                        <a
                            href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                            className="text-black font-medium underline hover:text-spotify-light transition-colors mx-1"
                        >
                            Get cookies.txt
                        </a>
                        or
                        <a
                            href="https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/"
                            className="text-black font-medium underline hover:text-spotify-light transition-colors mx-1"
                        >
                            cookies.txt</a> extension. More info
                        <a
                            href="https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp"
                            className="text-black font-medium underline hover:text-spotify-light transition-colors ml-1"
                        >
                            here
                        </a>.
                    </li>
                    <li>Export your cookies in Netscape format</li>
                    <li>Save the file and upload it here</li>
                </ol>
            </div>
        </div>
    )
}

export default CookieUpload
