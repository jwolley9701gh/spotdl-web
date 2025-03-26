import { useState, useEffect } from 'react';
import axios from 'axios';

export const useCookieStatus = () => {
    const [hasCookies, setHasCookies] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    const checkCookieStatus = async () => {
        try {
            setLoading(true);
            const response = await axios.get(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/cookie-status/`,
                {
                    withCredentials: true,
                }
            );

            setHasCookies(response.data.has_cookies);
        } catch (error) {
            console.error('Error checking cookie status:', error);
            setHasCookies(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkCookieStatus();
    }, []);

    return { hasCookies, loading, refreshStatus: checkCookieStatus };
};