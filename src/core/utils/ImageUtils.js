import {
    readFile
} from '@tauri-apps/plugin-fs';

import {
    USE_CACHED_IMAGING
} from "../Constants"

let cache = {}
let localPreloadCovers = {}
let localCovers = []
let cache_size = 0
let cache_events = {
    miss: 0,
    hit: 0
}
let cache_clear_interval;

class ImageCover {
    reset() {
        localCovers = []
        return this
    }

    add(...elements) {
        localCovers.push(...elements)
        return this
    }

    push(list = []) {
        covers.add(...list)
        return this
    }

    asList() {
        return localCovers
    }

    indexOf(cover) {
        return localCovers.indexOf(cover)
    }

    splice(i, number) {
        return localCovers.splice(i, number)
    }

    length() {
        return localCovers.length
    }

    get(id) {
        return localCovers[id];
    }
}

class PreloadImageCover {
    reset() {
        localPreloadCovers = {}
        return this
    }

    set(id, val) {
        localPreloadCovers[id] = val
    }

    get(id) {
        return localPreloadCovers[id]
    }

    asList() {
        return localPreloadCovers
    }

    ofCover(coverId) {
        return localPreloadCovers[covers.get(coverId)]
    }
}

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

function _internal_deref(url) {
    URL.revokeObjectURL(url);
}

function isAbsolute(cover) {
    if (navigator.userAgent.toLowerCase().includes('linux')) {
        return cover.startsWith("/")
    } else {
        return cover.includes(":")
    }
}

async function getImageEager(id) {
    const cover = localCovers[id];
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
        const images = import.meta.glob('../../assets/**/*.{png,jpg,jpeg,svg,json,webp}', {eager: true, query: '?url', import: 'default'});
        if (cover !== undefined) {
            return images["../../assets/" + cover]
        } else {
            return images["../../assets/" + id]
        }
    }
}

async function getImageCache(id) {
    if (cache[id] !== undefined) {
        cache[id].time = Date.now()
        cache_events.hit++;
        return cache[id].url
    } else {
        const url = await getImageEager(id)
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

/*
EXPORTED
 */

export const covers = new ImageCover()
export const preloadCovers = new PreloadImageCover()

export function deref(url) {
    if (USE_CACHED_IMAGING && cache[url] !== undefined) return;
    _internal_deref(url)
}

/**
 * Preloads and image given a path to optimize
 * image loading speeds.
 * @param {string} src - Path to the image
 * @returns {Promise<void>}
 */

export function preloadImage(src) {
    return new Promise(async (resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = await getImage(src, true);
        img.onerror = reject;
        resolve(img);
    });
}

/**
 * Get An Image Based On A List Of Covers
 *
 * @example ```javascript
 * let image = document.createElement("img");
 * let src_url = await getImage(0); // blob url for "cover.png"
 *
 * image.src = src_url; // Sets Image
 * ```
 *
 * @param id
 * @param eager
 * @returns {Promise<string>}
 */

export async function getImage(id, eager = false) {
    if (USE_CACHED_IMAGING && !eager) {
        return await getImageCache(id, localCovers)
    } else {
        return await getImageEager(id, localCovers)
    }
}

export function lazy_deref(url) {
    _internal_deref(url)
}