let __TAURI__APP = window.__TAURI__;
window.__TAURI__ = null;

/**
 * This function block is here to hide the
 * constants from the rest of the page.
 *
 * Blocks A Few Well-Known Ads/Trackers
 */

(() => {
    console.log("LINK REDIRECT - DOKI DOKI MOD MANAGER - INJECTED")
    const isLinux = navigator.userAgent.toLowerCase().includes("linux");

    const AD_DOMAINS = []
        let r = [
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

    function isUrlBlocked(value) {
        console.log(value)
        if (value == null) return false;

        const url = typeof value === "string" ? value : String(value);
        return AD_DOMAINS.some((domain) => url.includes(domain));
    }

    const originalFetch = window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : input?.url;

        if (isUrlBlocked(url)) {
            return Promise.reject(new Error(`Blocked request: ${url}`));
        }

        return originalFetch.call(this, input, init);
    };

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._blockedByScript = isUrlBlocked(url);

        if (this._blockedByScript) {
            return;
        }

        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        if (this._blockedByScript) {
            queueMicrotask(() => {
                this.dispatchEvent(new Event("error"));
                this.dispatchEvent(new Event("loadend"));
            });
            return;
        }

        return originalSend.apply(this, args);
    };

    if (!isLinux) return;

    function getFilenameFromUrl(url) {
        try {
            const parsed = new URL(url, window.location.href);
            const name = parsed.pathname.split("/").pop();

            return name && name.includes(".")
                ? decodeURIComponent(name)
                : "download.bin";
        } catch {
            return url.split("/").pop()?.split("?")[0] || "download.bin";
        }
    }

    function getFilenameFromBlob(blob) {
        const subtype = blob.type.split("/")[1]?.split(";")[0] || "bin";
        return `download.${subtype}`;
    }

    async function requestDownload(fileName, url) {
        __TAURI__APP.event.emit("request_download", {
            file_name: fileName,
            url: url
        })
    }

    async function saveBlob(blob, filename) {
        try {
            const path = await requestDownload(filename, blob);

            if (path) {
                console.log(`[downloads] Saved "${filename}" to ${path}`);
            }
        } catch (error) {
            console.error(`[downloads] Failed to save "${filename}":`, error);
        }
    }

    async function triggerDownload(url, filename) {
        try {
            const path = await requestDownload(filename, url);
            console.log(`[downloads] Saved "${filename}" to ${path}`);
        } catch (err) {
            console.error(`[downloads] Failed to save "${filename}":`, err);
        }
    }

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        const url = this.href;
        const shouldIntercept =
            this.hasAttribute("download") ||
            url?.startsWith("http://") ||
            url?.startsWith("https://");

        if (!shouldIntercept) {
            return originalClick.call(this);
        }

        const filename =
            this.getAttribute("download") ||
            getFilenameFromUrl(url);

        void triggerDownload(url, filename);
    };
    navigator.msSaveBlob = async function (blob, filename) {
        await saveBlob(blob, filename || getFilenameFromBlob(blob));
        return true;
    };
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
        name: "external_webview_" + Date.now()
    })

    return null;
};