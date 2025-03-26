import React, { useState, ChangeEvent } from 'react';
import axios from 'axios';
import { useCookieStatus } from '@/hooks/useCookieStatus';

interface CookieUploadProps {
    onStatusChange?: (hasCookies: boolean) => void;
}

const CookieUpload = ({ onStatusChange }: CookieUploadProps) => {
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState<string>('');
    const { hasCookies, loading, refreshStatus } = useCookieStatus();

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage('Please select a file first');
            return;
        }

        const formData = new FormData();
        formData.append('cookie_file', file);

        try {
            const csrfToken = document.cookie.match(/csrftoken=([\w-]+)/)?.[1];

            await axios.post(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/upload-cookies/`,
                formData,
                {
                    headers: {
                        'X-CSRFToken': csrfToken,
                        'Content-Type': 'multipart/form-data',
                    },
                    withCredentials: true,
                }
            );

            setMessage('Cookie file uploaded successfully');
            setFile(null);

            // Refresh cookie status and notify parent
            await refreshStatus();
            onStatusChange?.(true);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                setMessage(error.response?.data?.error || 'Error uploading cookie file');
            } else {
                setMessage('Error uploading cookie file');
            }
            console.error('Upload error:', error);
            onStatusChange?.(false);
        }
    };

    return (
        <div className="mt-4 p-4 border rounded">
            <h2 className="text-lg font-semibold mb-2">Upload Cookies</h2>
            {loading ? (
                <p className="text-sm text-gray-600">Checking cookie status...</p>
            ) : (
                <>
                    {hasCookies ? (
                        <p className="text-sm text-green-600 mb-2">Cookie file is present</p>
                    ) : (
                        <p className="text-sm text-yellow-600 mb-2">Please upload a cookie file to enable downloads</p>
                    )}
                    <input
                        type="file"
                        onChange={handleFileChange}
                        className="mb-2 block"
                        accept=".txt"
                    />
                    <button
                        onClick={handleUpload}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Upload
                    </button>
                    {message && (
                        <p className="mt-2 text-sm text-gray-600">{message}</p>
                    )}
                </>
            )}
        </div>
    );
};

export default CookieUpload;