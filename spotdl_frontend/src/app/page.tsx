'use client'; // Mark this as a Client Component

import { useState, FormEvent } from 'react';
import axios from 'axios';

export default function Home() {
  const [url, setUrl] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [fileUrl, setFileUrl] = useState<string>('');

  const handleDownload = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('Downloading...');
    setProgress(0);
    setFileUrl('');

    try {
      const response = await axios.post<{ message: string; file_url: string }>(
        'http://localhost:8000/api/download/',
        { url },
        {
          onDownloadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setProgress(percentCompleted);
          },
        }
      );
      setMessage(response.data.message);
      setFileUrl(response.data.file_url);
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'An error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Spotify Downloader</h1>
        <form onSubmit={handleDownload} className="space-y-4">
          <input
            type="text"
            placeholder="Enter Spotify URL (Song or Playlist)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition duration-200"
          >
            Download
          </button>
        </form>
        {message && <p className="mt-4 text-center">{message}</p>}
        {progress > 0 && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-center mt-2">{progress}%</p>
          </div>
        )}
        {fileUrl && (
          <div className="mt-4 text-center">
            <a
              href={`http://localhost:8000${fileUrl}`}
              download
              className="text-blue-500 hover:underline"
            >
              Download {fileUrl.includes('.zip') ? 'Playlist' : 'Song'}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}