// ==UserScript==
// @name         Cursor Token获取器-v2
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  使用GM_xmlhttpRequest获取Cursor会话token（自动获取Cookie）
// @author       You
// @match        https://www.cursor.com/*
// @match        https://cursor.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api2.cursor.sh
// @connect      cursor.sh
// ==/UserScript==

(function () {
    'use strict';

    // 获取 cookie 中指定键值
    function getCookieValue(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        if (match) return match[2];
        return null;
    }

    // 生成 PKCE 验证对
    function generatePKCEPair () {
        const array = new Uint8Array (32);
        crypto.getRandomValues (array);
        const codeVerifier = btoa (String.fromCharCode.apply (null, array))
            .replace (/\+/g, '-')
            .replace (/\//g, '_')
            .replace (/=/g, '')
            .substring (0, 43);

        return crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (codeVerifier))
            .then (hashBuffer => {
                const hashArray = new Uint8Array (hashBuffer);
                const codeChallenge = btoa (String.fromCharCode.apply (null, hashArray))
                    .replace (/\+/g, '-')
                    .replace (/\//g, '_')
                    .replace (/=/g, '');
                return { codeVerifier, codeChallenge };
            });
    }

    // 生成 UUID
    function generateUUID () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace (/[xy]/g, function (c) {
            const r = Math.random () * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString (16);
        });
    }

    // 设置 Cookie
    function setCookie (name, value) {
        document.cookie = `${name}=${value}; path=/; domain=.cursor.com`;
    }

    // 发起 GM 请求
    function makeGMRequest (url) {
        return new Promise ((resolve, reject) => {
            GM_xmlhttpRequest ({
                method: 'GET',
                url: url,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/0.48.6 Chrome/132.0.6834.210 Electron/34.3.4 Safari/537.36",
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache"
                },
                timeout: 10000,
                onload: function (response) {
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse (response.responseText);
                            resolve (data);
                        } catch (e) {
                            reject (new Error ('JSON 解析失败: ' + e.message));
                        }
                    } else {
                        reject (new Error (`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: function (error) {
                    reject (new Error (' 网络请求失败 '));
                },
                ontimeout: function () {
                    reject (new Error (' 请求超时 '));
                }
            });
        });
    }

    // 轮询认证状态
    async function pollAuthStatus (uuid, verifier, maxAttempts = 20) {
        let attempts = 0;
        while (attempts < maxAttempts) {
            try {
                const authPollUrl = `https://api2.cursor.sh/auth/poll?uuid=${uuid}&verifier=${verifier}`;
                const data = await makeGMRequest (authPollUrl);
                const accessToken = data.accessToken;
                const authId = data.authId || "";
                if (accessToken) {
                    let userId = "";
                    if (authId.includes ("|")) {
                        userId = authId.split ("|")[1];
                    }
                    return { userId, accessToken };
                }
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise (resolve => setTimeout (resolve, 3000));
                }
            } catch (error) {
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise (resolve => setTimeout (resolve, 3000));
                } else {
                    throw new Error (`轮询失败: ${error.message}`);
                }
            }
        }
        throw new Error ('轮询超时，请确保已点击登录按钮');
    }

    // 获取 Cursor Session Token
    async function getCursorSessionToken (sessionToken) {
        if (sessionToken) {
            setCookie ("WorkosCursorSessionToken", sessionToken);
        }
        const { codeVerifier, codeChallenge } = await generatePKCEPair ();
        const uuid = generateUUID ();
        const clientLoginUrl = `https://www.cursor.com/cn/loginDeepControl?challenge=${codeChallenge}&uuid=${uuid}&mode=login`;
        window.open (clientLoginUrl, '_blank');
        return { uuid, codeVerifier, clientLoginUrl };
    }

    // 创建悬浮框 UI
    function createFloatingUI () {
        if (document.getElementById ('cursor-token-floater')) return;

        const floater = document.createElement ('div');
        floater.id = 'cursor-token-floater';

                floater.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                width: 480px;
                background: #fff;
                border: 2px solid #007bff;
                border-radius: 10px;
                box-shadow: 0 4px 20px rgba (0,0,0,0.15);
                z-index: 10000;
                font-family: Arial, sans-serif;
                font-size: 14px;
                color: #000;
            ">
                <div style="
                    background: #007bff;
                    color: white;
                    padding: 12px 15px;
                    border-radius: 8px 8px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <span style="font-weight: bold; font-size: 16px;">Cursor Token 获取器 </span>
                    <button id="close-floater" style="
                        background: none;
                        border: none;
                        color: white;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 0;
                        width: 24px;
                        height: 24px;
                    ">×</button>
                </div>
                <div style="padding: 20px; color: #000;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #000;">Session Token:</label>
                        <input type="text" id="session-token-input" placeholder="输入 WorkosCursorSessionToken" style="
                            width: 100%;
                            padding: 10px;
                            border: 2px solid #ddd;
                            border-radius: 6px;
                            box-sizing: border-box;
                            font-size: 14px;
                            color: #FFF;
                        ">
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <button id="start-auth-btn" style="
                            flex: 1;
                            padding: 12px;
                            background: #28a745;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        ">🚀 开始认证 </button>
                        <button id="poll-token-btn" style="
                            flex: 1;
                            padding: 12px;
                            background: #ffc107;
                            color: #000;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                            display: none;
                        ">🎯 获取 Token</button>
                    </div>

                    <div style="margin-bottom: 15px; padding: 12px; background: #e8f4fd; border: 2px solid #bee5eb; border-radius: 6px; color: #000;">
                        <div style="font-weight: bold; margin-bottom: 8px; color: #000;">📋 使用步骤：</div>
                        <div style="color: #000; line-height: 1.6;">
                            <strong>1.</strong> 输入 Session Token<br>
                            <strong>2.</strong> 点击 "开始认证"<br>
                            <strong>3.</strong> 在新页面点击 "Yes, Log In"<br>
                            <strong>4.</strong> 点击 "获取 Token" 自动轮询结果
                        </div>
                    </div>

                    <div id="result-area" style="
                        background: #f8f9fa;
                        border: 2px solid #e9ecef;
                        border-radius: 6px;
                        padding: 15px;
                        min-height: 100px;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        white-space: pre-wrap;
                        word-break: break-all;
                        max-height: 300px;
                        overflow-y: auto;
                        color: #000;
                        line-height: 1.4;
                    "> 等待开始认证流程...</div>
                </div>
            </div>
        `;

        document.body.appendChild (floater);

        // 自动获取 session token
        let sessionToken = getCookieValue("WorkosCursorSessionToken");
        if (!sessionToken) {
            sessionToken = GM_getValue('cursor_session_token', '');
        }

        if (sessionToken) {
            document.getElementById('session-token-input').value = sessionToken;
        }

        let authInfo = null;

        document.getElementById ('close-floater').onclick = () => floater.remove ();

        document.getElementById ('start-auth-btn').onclick = async () => {
            const sessionToken = document.getElementById ('session-token-input').value.trim ();
            const resultArea = document.getElementById ('result-area');
            const startBtn = document.getElementById ('start-auth-btn');
            const pollBtn = document.getElementById ('poll-token-btn');

            if (!sessionToken) {
                resultArea.textContent = '❌ 请先输入 Session Token！';
                resultArea.style.color = '#dc3545';
                return;
            }

            GM_setValue ('cursor_session_token', sessionToken);
            startBtn.textContent = ' 初始化中...';
            startBtn.disabled = true;
            resultArea.style.color = '#000';
            resultArea.textContent = ' 正在初始化认证流程...';

            try {
                authInfo = await getCursorSessionToken (sessionToken);
                resultArea.innerHTML = `✅ 认证流程已启动！ 请点击新窗口中的 "Yes, Log In"，然后返回点击 "获取 Token"`;
                pollBtn.style.display = 'block';
                startBtn.textContent = '🚀 开始认证 ';
                startBtn.disabled = false;
            } catch (error) {
                resultArea.style.color = '#dc3545';
                resultArea.textContent = `❌ 初始化失败: ${error.message}`;
                startBtn.textContent = '🚀 开始认证 ';
                startBtn.disabled = false;
            }
        };

        document.getElementById ('poll-token-btn').onclick = async () => {
            if (!authInfo) {
                document.getElementById ('result-area').textContent = '❌ 请先点击 "开始认证"';
                return;
            }

            const resultArea = document.getElementById ('result-area');
            const pollBtn = document.getElementById ('poll-token-btn');

            pollBtn.textContent = ' 轮询中...';
            pollBtn.disabled = true;
            resultArea.style.color = '#000';
            resultArea.textContent = ' 正在轮询获取 Token，请稍候...\n\n 确保已点击登录';

            try {
                const result = await pollAuthStatus (authInfo.uuid, authInfo.codeVerifier);
                resultArea.innerHTML = `<strong>User ID:</strong> ${result.userId}<br><br><strong>Access Token:</strong><br>${result.accessToken}`;

                const copyBtn = document.createElement ('button');
                copyBtn.textContent = '📋 复制 Access Token';
                copyBtn.style.cssText = `margin-top: 10px; padding: 10px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer;`;
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText (result.accessToken).then (() => {
                        copyBtn.textContent = '✅ 已复制！';
                        setTimeout (() => copyBtn.textContent = '📋 复制 Access Token', 3000);
                    });
                };

                resultArea.parentNode.appendChild (copyBtn);
            } catch (error) {
                resultArea.style.color = '#dc3545';
                resultArea.textContent = `❌ 获取失败: ${error.message}`;
            } finally {
                pollBtn.textContent = '🎯 获取 Token';
                pollBtn.disabled = false;
            }
        };
    }

    // 页面加载完创建 UI
    if (document.readyState === 'loading') {
        document.addEventListener ('DOMContentLoaded', createFloatingUI);
    } else {
        createFloatingUI ();
    }

})();
