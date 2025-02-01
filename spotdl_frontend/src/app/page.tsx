'use client'; // Mark this as a Client Component

import { useState, FormEvent } from 'react';
import axios from 'axios';

export default function Home() {
  const [url, setUrl] = useState<string>('');
  const [generateLrc, setGenerateLrc] = useState<boolean>(true); // Default to True
  const [dirName, setDirName] = useState<string>('out'); // Default to 'out'
  const [message, setMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [fileUrl, setFileUrl] = useState<string>('');
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false); // Loading state

  const handleDownload = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(`Downloading into ${dirName}...`);
    setIsLoading(true); // Start loading
    setProgress(0);
    setFileUrl('');
    setStdout('');
    setStderr('');

    try {
      const response = await axios.post<{
        message: string;
        file_url: string;
        stdout: string;
        stderr: string;
      }>(
        'http://localhost:8000/api/download/',
        { url, generate_lrc: generateLrc, dir_name: dirName }, // Send dir_name
        {
          headers: {
            'Content-Type': 'application/json', // Ensure JSON content type
          },
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
      setStdout(response.data.stdout); // Display stdout
      setStderr(response.data.stderr); // Display stderr
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'An error occurred');
      setStdout(error.response?.data?.stdout || ''); // Display stdout from error
      setStderr(error.response?.data?.stderr || ''); // Display stderr from error
    } finally {
      setIsLoading(false); // Stop loading
      setUrl(''); // Reset URL field
      setDirName('out'); // Reset directory name field
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-black">Spotify Downloader</h1>
        <form onSubmit={handleDownload} className="space-y-4">
          <input
            type="text"
            placeholder="Enter Spotify URL (Song or Playlist)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            required
          />
          <div className="flex items-center">
            <input
              type="checkbox"
              id="generate-lrc"
              checked={generateLrc}
              onChange={(e) => setGenerateLrc(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="generate-lrc" className="text-sm text-black">
              Include synced lyrics (LRC)
            </label>
          </div>
          <input
            type="text"
            placeholder="Enter directory name (default: out)"
            value={dirName}
            onChange={(e) => setDirName(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition duration-200 flex items-center justify-center"
            disabled={isLoading} // Disable button while loading
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Downloading...
              </>
            ) : (
              'Download'
            )}
          </button>
        </form>
        {message && <p className="mt-4 text-center text-black">{message}</p>}
        {progress > 0 && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-center mt-2 text-gray-400">{progress}%</p>
          </div>
        )}
        {fileUrl && (
          <div className="mt-4 text-center">
            <a
              href={`http://localhost:8000${fileUrl}`}
              download
              className="text-blue-500 hover:underline"
            >
              Download {fileUrl.includes('.zip') ? 'Zip File' : 'Song'}
            </a>
          </div>
        )}
        {(stdout || stderr) && (
          <div className="mt-4 space-y-4">
            {stdout && (
              <div>
                <h2 className="text-lg font-bold text-green-600">Output:</h2>
                <pre className="bg-gray-100 p-2 rounded-md text-sm max-h-40 overflow-y-auto text-green-600">
                  {stdout}
                </pre>
              </div>
            )}
            {stderr && (
              <div>
                <h2 className="text-lg font-bold text-red-500">Errors:</h2>
                <pre className="bg-red-100 p-2 rounded-md text-sm text-red-600 max-h-40 overflow-y-auto">
                  {stderr}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}