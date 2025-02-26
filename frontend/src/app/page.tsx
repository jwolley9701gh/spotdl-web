"use client"; // Mark this as a Client Component

import { useState, useEffect } from "react";
import axios from "axios";

export default function Home() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Fetch the CSRF token when the component mounts
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/csrf/`,
          {
            withCredentials: true, // Include credentials (cookies)
          }
        );
        const token = response.data.csrfToken; // Extract the token from the response body
        setCsrfToken(token); // Store the token in state
        console.log("CSRF Token fetched:", token);
      } catch (error) {
        console.error("Error fetching CSRF token:", error);
      }
    };
    fetchCsrfToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Downloading...");
    setDownloadUrl("");

    if (!csrfToken) {
      setMessage("CSRF token not found");
      return;
    }

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/download/`,
        { url: url },
        {
          headers: {
            "X-CSRFToken": csrfToken, // Include the CSRF token in the headers
            "Content-Type": "application/json",
          },
          withCredentials: true, // Include credentials (cookies)
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
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Download
        </button>
      </form>
      {message && <p className="mt-4 text-green-600">{message}</p>}
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