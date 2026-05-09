import { BrowserWindow, session } from 'electron';

import { createLog } from '/@/main/utils';
import { SSO_COOKIE_KEYS } from '/@/shared/constants/sso-cookie-keys';
import { SsoLoginResponse } from '/@/shared/types/domain-types';

const COOKIE_POLL_INTERVAL = 500; // ms
const COOKIE_POLL_MAX_ATTEMPTS = 20; // 10 seconds total

export const handleSsoLogin = async (
    _event: any,
    url: string,
    ssoCookieName = SSO_COOKIE_KEYS.CLOUDFLARE_ACCESS,
): Promise<SsoLoginResponse> => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('Invalid SSO URL protocol');
    }

    const ssoWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 800,
        title: 'SSO Login',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        width: 600,
    });

    // Parse the base URL (origin) for cookie matching
    let baseUrl: string;
    try {
        const urlObj = new URL(url);
        baseUrl = urlObj.origin;
    } catch {
        baseUrl = url;
    }

    let success = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const checkCookiesForOrigin = async (): Promise<Record<string, string>> => {
        // Get ALL cookies from the session and filter by name
        // This avoids URL-matching issues when redirects change the path/query
        const allCookies = await session.defaultSession.cookies.get({});
        const cookieMap: Record<string, string> = {};
        for (const cookie of allCookies) {
            // Match by cookie name (and optionally domain)
            if (cookie.name === ssoCookieName) {
                cookieMap[cookie.name] = cookie.value;
            }
        }
        return cookieMap;
    };

    const stopPolling = () => {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    };

    const startCookiePolling = () => {
        stopPolling();
        let attempts = 0;

        return new Promise<boolean>((resolve) => {
            pollInterval = setInterval(async () => {
                attempts++;
                const cookies = await checkCookiesForOrigin();

                if (cookies[ssoCookieName]) {
                    stopPolling();
                    createLog({ message: `SSO cookie detected after ${attempts} poll(s)`, type: 'info' });
                    resolve(true);
                    return;
                }

                if (attempts >= COOKIE_POLL_MAX_ATTEMPTS) {
                    stopPolling();
                    createLog({ message: `SSO cookie poll timed out after ${attempts} attempts`, type: 'info' });
                    resolve(false);
                }
            }, COOKIE_POLL_INTERVAL);
        });
    };

    return new Promise((resolve) => {
        ssoWindow.loadURL(url);

        // Start polling for the cookie as soon as the window loads
        // The cookie may be set after the page loads (via JavaScript redirect)
        startCookiePolling().then((found) => {
            if (found) {
                success = true;
            }
        });

        // Also check on navigation - if we navigate away and come back with the cookie, we'll catch it
        ssoWindow.webContents.on('did-navigate', async () => {
            // On navigation, check immediately and start polling
            const cookies = await checkCookiesForOrigin();
            if (cookies[ssoCookieName]) {
                success = true;
                stopPolling();
                ssoWindow.close();
            }
        });

        ssoWindow.webContents.on('did-navigate-in-page', async () => {
            // Same-page navigations (like SPA redirects) also need a check
            const cookies = await checkCookiesForOrigin();
            if (cookies[ssoCookieName]) {
                success = true;
                stopPolling();
                ssoWindow.close();
            }
        });

        ssoWindow.on('closed', async () => {
            stopPolling();
            // Final check on close - ensures we capture cookie even if polling is still running
            const cookies = await checkCookiesForOrigin();
            const finalSuccess = success || !!cookies[ssoCookieName];
            createLog({ message: `SSO window closed. Cookie found: ${!!cookies[ssoCookieName]}, success: ${finalSuccess}`, type: 'info' });
            resolve({ cookies, success: finalSuccess });
        });
    });
};
