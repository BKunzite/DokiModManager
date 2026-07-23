let __TAURI__APP = window.__TAURI__;
window.__TAURI__ = null;

/**
 * This function block is here to hide the
 * constants from the rest of the page.
 *
 * Blocks A Few Well-Known Ads/Trackers
 */

(() => {
    const isLinux = navigator.userAgent.toLowerCase().includes('linux');
    const AD_DOMAINS = [
        "doubleclick.net",
        "googlesyndication.com",
        "adservice.google.com",
        "googleadservices.com",
        "google-analytics.com",
        "googletagmanager.com",
        "adnxs.com",
        "rubiconproject.com",
        "pubmatic.com",
        "openx.net",
        "criteo.com",
        "criteo.net",
        "taboola.com",
        "outbrain.com",
        "scorecardresearch.com",
        "quantserve.com",
        "hotjar.com",
        "fullstory.com",
        "clarity.ms",
        "amplitude.com",
        "mixpanel.com",
        "amazon-adsystem.com",
        "connect.facebook.net"
    ];

    const IS_URL_BLOCKED = (url) => {
        if (url === null || url === undefined) {
            return false;
        }
        return AD_DOMAINS.some(domain => url.includes(domain));
    };

    const OLD_FETCH = window.fetch;
    const OLD_OPEN = XMLHttpRequest.prototype.open;
    const OLD_SEND = XMLHttpRequest.prototype.send;

    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : input.url;
        if (IS_URL_BLOCKED(url)) {
            return Promise.reject(new Error('Blocked'))
        }
        return OLD_FETCH.apply(this, arguments)
    };

    XMLHttpRequest.prototype.open = function (method, url) {
        if (IS_URL_BLOCKED(url)) {
            this._blocked = true;
            return;
        }
        return OLD_OPEN.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        if (this._blocked) return;
        return OLD_SEND.apply(this, arguments);
    };

    if (!isLinux) {
        return;
    }

    const blobMap = new Map();
    const originalCreateObjectURL = URL.createObjectURL;

    URL.createObjectURL = function (obj) {
        const url = originalCreateObjectURL.call(this, obj);
        if (obj instanceof Blob && !(obj instanceof MediaSource)) {
            blobMap.set(url, obj);
        }
        return url;
    };

    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = function (url) {
        blobMap.delete(url);
        originalRevoke.call(this, url);
    };

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download') || this.href?.startsWith('blob:')) {
            const filename = this.getAttribute('download') || getFilenameFromUrl(this.href);
            triggerDownload(this.href, filename);
            return;
        }
        return originalClick.call(this);
    };

    navigator.msSaveBlob = async function (blob, filename) {
        const name = filename || getFilenameFromBlob(blob);
        await saveBlob(blob, name);
        return true;
    };

    const requestDownload = (file_name, bytes) => {
        __TAURI__APP.event.emit("request_download", {
            file_name: file_name,
            url: bytes
        })
        return Promise.reject(new Error('Tauri internals not available'));
    };

    function getFilenameFromUrl(url) {
        try {
            const u = new URL(url, window.location.href);
            const name = u.pathname.split('/').pop();
            if (name && name.includes('.')) return decodeURIComponent(name);
            return 'download.bin';
        } catch {
            return url.split('/').pop()?.split('?')[0] || 'download.bin';
        }
    }

    function getFilenameFromBlob(blob) {
        const ext = blob.type.split('/')[1]?.split(';')[0] || 'bin';
        return `download.${ext}`;
    }

    async function saveBlob(blob, filename) {
        try {
            const path = await requestDownload(filename, blob);
            console.log(`[downloads] Saved "${filename}" to ${path}`);
        } catch (err) {
            console.error(`[downloads] Failed to save "${filename}":`, err);
        }
    }

    async function triggerDownload(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            await saveBlob(blob, filename);
        } catch (err) {
            console.error(`[downloads] Fetch failed for ${url}:`, err);
        }
    }
})();

/**
 * Fix Links That Open To _blank
 */

document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;

    const href = a.href || "";
    if (a.target === "_blank" || a.rel?.includes("noopener")) {
        e.preventDefault();

        const label = "external-" + Date.now();
        __TAURI__APP.event.emit("open_webview", {
            url: href,
            name: label
        })
    }
}, true);

/**
 * Hijack New Window And Re-route It Through Tauri
 */

window.open = function (url, _target, _features) {
    __TAURI__APP.event.emit("open_webview", {
        url: url,
        name: "external_webview"
    })

    return null;
};