"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import CookieUpload from "@/components/CookieUpload";
import { useCookieStatus } from "@/hooks/useCookieStatus";

export default function Home() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const { hasCookies, loading: cookieLoading, refreshStatus } = useCookieStatus();

  // Fetch the CSRF token when the component mounts
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/csrf/`,
          {
            withCredentials: true,
          }
        );
        setCsrfToken(response.data.csrfToken);
      } catch (error) {
        console.error("Error fetching CSRF token:", error);
        setMessage("Failed to fetch CSRF token");
      }
    };
    fetchCsrfToken();
  }, []);

  const handleCookieStatusChange = () => {
    refreshStatus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasCookies) {
      setMessage("Please upload a cookie file first");
      return;
    }

    setMessage("Downloading...");
    setDownloadUrl("");

    if (!csrfToken) {
      setMessage("CSRF token not found");
      return;
    }

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download/`,
        { url },
        {
          headers: {
            "X-CSRFToken": csrfToken,
            'Content-Type': 'application/json',
          },
          withCredentials: true,
        }
      );

      setMessage(response.data.message);
      setDownloadUrl(response.data.download_url);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.error || "An error occurred");
      } else {
        setMessage("An unexpected error occurred");
      }
      setDownloadUrl("");
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">SpotDL Web App</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter Spotify URL"
          required
          className="w-full p-2 border border-gray-300 rounded"
        />
        <button
          type="submit"
          disabled={!hasCookies || cookieLoading || !csrfToken}
          className={`px-4 py-2 text-white rounded ${!hasCookies || cookieLoading || !csrfToken
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600'
            }`}
        >
          Download
        </button>
      </form>

      <CookieUpload
        csrfToken={csrfToken}
        onStatusChange={handleCookieStatusChange}
      />

      {message && (
        <p className={`mt-4 ${message.includes('error') || message.includes('Failed') ? 'text-red-600' : 'text-green-600'
          }`}>
          {message}
        </p>
      )}

      {downloadUrl && (
        <div className="mt-4">
          <p className="text-blue-600">Download your song:</p>
          <a
            href={`${process.env.NEXT_PUBLIC_BACKEND_URL}${downloadUrl}`}
            download
            className="text-blue-500 underline"
          >
            Click here to download
          </a>
        </div>
      )}
    </div>
  );
}