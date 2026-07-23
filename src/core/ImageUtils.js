import {
    readFile
} from '@tauri-apps/plugin-fs';

let cache = {}
let cache_size = 0
let cache_events = {
    miss: 0,
    hit: 0
}
let cache_clear_interval;
const USE_CACHED = true;

function createURL(contents, fileName) {
    let blob = new Blob([contents], {type: 'image/' + fileName.split('.').pop()});
    const url = URL.createObjectURL(blob);
    blob = null
    return url;
}

function createBase64URL(contents, type = "image/png") {
    let blob = new Blob([contents], {type: type});
    const url = URL.createObjectURL(blob);
    blob = null
    return url;
}

export function deref(url) {
    if (USE_CACHED && cache[url] !== undefined) return;
    _internal_deref(url)
}

export function lazy_deref(url) {
    _internal_deref(url)
}

function _internal_deref(url) {
    URL.revokeObjectURL(url);
}

/**
 * Get An Image Based On A List Of Covers
 *
 * @example ```javascript
 * let covers = ["cover.png", "cover2.png"];
 * let image = document.createElement("img");
 * let src_url = await getImage(0, covers); // blob url for "cover.png"
 *
 * image.src = src_url; // Sets Image
 * ```
 *
 * @param id
 * @param covers
 * @returns {Promise<string>}
 */

export async function getImage(id, covers = [], eager = false) {
    if (USE_CACHED && !eager) {
        return await getImageCache(id, covers)
    } else {
        return await getImageEager(id, covers)
    }
}

function isAbsolute(cover) {
    if (navigator.userAgent.toLowerCase().includes('linux')) {
        return cover.startsWith("/")
    } else {
        return cover.includes(":")
    }
}

async function getImageEager(id, covers = []) {
    const cover = covers[id];
    if (cover !== undefined && isAbsolute(cover)) {
        const contents = await readFile(cover);
        return createURL(contents, cover)
    } else if (typeof (id) === "object") {
        const bytes = new Uint8Array(id);
        return createBase64URL(bytes)
    } else if (typeof (id) === "string" && isAbsolute(id)) {
        const contents = await readFile(id);
        return createURL(contents, id)
    } else {
        const images = import.meta.glob('../assets/**/*.{png,jpg,jpeg,svg,json,webp}', {eager: true, query: '?url', import: 'default'});
        if (cover !== undefined) {
            return images["../assets/" + cover]
        } else {
            return images["../assets/" + id]
        }
    }
}

// CACHE
export async function getImageCache(id, covers = []) {
    if (cache[id] !== undefined) {
        cache[id].time = Date.now()
        cache_events.hit++;
        return cache[id].url
    } else {
        const url = await getImageEager(id, covers)
        cache[id] = {
            url: url,
            id: id,
            time: Date.now()
        };
        cache_size++;
        cache_events.miss++;
        if (cache_clear_interval === undefined) {
            cache_clear_interval = setInterval(() => {
                if (cache_size > 0) {
                    cull_cache()
                } else {
                    clearInterval(cache_clear_interval)
                    cache_clear_interval = undefined
                }
            }, 500)
        }
        return url;
    }
}

function cull_cache() {
    let oldestKey = undefined;
    let oldest = Date.now() + 1;
    for (const key in cache) {
        const data = cache[key];
        if (data.time < oldest) {
            oldestKey = data
            oldest = data.time
        }
    }
    if (oldestKey !== undefined) {
        _internal_deref(oldestKey.url)
        delete cache[oldestKey.id]
        cache_size--;
    }
}
