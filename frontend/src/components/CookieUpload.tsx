// CookieUpload.tsx
import React, { useState, ChangeEvent } from "react";
import axios from "axios";

interface CookieUploadProps {
    csrfToken: string | null;
    onStatusChange?: () => void;
}

const CookieUpload = ({ csrfToken, onStatusChange }: CookieUploadProps) => {
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState<string>("");

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setMessage("");
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage("Please select a file first");
            return;
        }
        if (!csrfToken) {
            setMessage("CSRF token not available. Please refresh and try again.");
            return;
        }

        const formData = new FormData();
        formData.append("cookie_file", file);

        try {
            await axios.post(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/upload-cookies/`,
                formData,
                {
                    headers: { "X-CSRFToken": csrfToken },
                    withCredentials: true,
                }
            );
            setMessage("Cookie file uploaded successfully");
            setFile(null);
            onStatusChange?.();
        } catch (err) {
            console.error("Cookie upload error:", err);
            setMessage(
                axios.isAxiosError(err)
                    ? err.response?.data?.error || "Error uploading cookie file"
                    : "Unexpected error uploading cookie file"
            );
        }
    };

    return (
        <div className="mt-4 p-4 border rounded">
            <h2 className="text-lg font-semibold mb-2">Upload Cookies</h2>
            <input
                type="file"
                onChange={handleFileChange}
                accept=".txt"
                className="mb-2 block"
            />
            <button
                onClick={handleUpload}
                disabled={!csrfToken}
                className={`px-4 py-2 rounded text-white ${!csrfToken ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"
                    }`}
            >
                Upload
            </button>
            {message && (
                <p
                    className={`mt-2 text-sm ${message.toLowerCase().includes("success") ? "text-green-600" : "text-red-600"
                        }`}
                >
                    {message}
                </p>
            )}
        </div>
    );
};

export default CookieUpload;
