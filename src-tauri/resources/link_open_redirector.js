let __TAURI__APP = window.__TAURI__;
window.__TAURI__ = null;

/**
 * This function block is here to hide the
 * constants from the rest of the page.
 *
 * Blocks A Few Well Known Ads/Trackers
 */

(function () {
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

    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input.url;
        if (IS_URL_BLOCKED(url)) return Promise.reject(new Error('Blocked'));
        return OLD_FETCH.apply(this, arguments);
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