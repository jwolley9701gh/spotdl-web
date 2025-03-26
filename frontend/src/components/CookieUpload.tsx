import React, { useState, ChangeEvent } from 'react';

const CookieUpload = () => {
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState<string>('');

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
            const headers = new Headers();
            if (csrfToken) {
                headers.append('X-CSRFToken', csrfToken);
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/upload-cookies/`,
                {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                    headers: headers,
                }
            );

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            setMessage('Cookie file uploaded successfully');
            setFile(null); // Reset file input after successful upload
        } catch (error) {
            setMessage('Error uploading cookie file');
            console.error('Upload error:', error);
        }
    };

    return (
        <div className="mt-4 p-4 border rounded">
            <h2 className="text-lg font-semibold mb-2">Upload Cookies</h2>
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
        </div>
    );
};

export default CookieUpload;