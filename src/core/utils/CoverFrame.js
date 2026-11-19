// macOS fixes contributed, 2026-11-19. Non-destructive, per-mod framing.
const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeFrame(frame, source) {
    if (!frame || frame.source !== source) frame = {};
    return {source, fit: frame.fit === "contain" ? "contain" : "cover",
        zoom: clamp(frame.zoom, 1, 4, 1), x: clamp(frame.x, 0, 1, .5), y: clamp(frame.y, 0, 1, .5)};
}

export function frameGeometry(width, height, imageWidth, imageHeight, frame) {
    if (![width, height, imageWidth, imageHeight].every(value => Number.isFinite(value) && value > 0)) return null;
    const scale = (frame.fit === "contain" ? Math.min : Math.max)(width / imageWidth, height / imageHeight) * frame.zoom;
    const w = imageWidth * scale, h = imageHeight * scale;
    return {width: w, height: h, left: (width - w) * frame.x, top: (height - h) * frame.y};
}

export function applyCoverFrame(element, image, frame) {
    const render = () => {
        const geometry = frameGeometry(element.clientWidth, element.clientHeight, image.naturalWidth, image.naturalHeight, frame);
        element.style.backgroundImage = `url(${JSON.stringify(image.src)})`;
        element.style.backgroundRepeat = "no-repeat";
        element.style.backgroundPosition = `${frame.x * 100}% ${frame.y * 100}%`;
        element.style.backgroundSize = geometry
            ? `${geometry.width / element.clientWidth * 100}% ${geometry.height / element.clientHeight * 100}%` : frame.fit;
    };
    // One observer per live element, replaced when another mod is selected.
    element._coverResizeObserver?.disconnect();
    element._coverResizeObserver = new ResizeObserver(render);
    element._coverResizeObserver.observe(element);
    render();
}

export async function updateModCover(config, source, frame, persist) {
    const previous = {coverId: config.coverId, coverFrame: config.coverFrame};
    const hadFrame = Object.hasOwn(config, "coverFrame");
    config.coverId = source;
    config.coverFrame = normalizeFrame(frame, source);
    try {
        await persist();
    } catch (error) {
        config.coverId = previous.coverId;
        if (hadFrame) config.coverFrame = previous.coverFrame;
        else delete config.coverFrame;
        throw error;
    }
}

// Home uses the same image at two different aspect ratios. Keep the crops independent.
export function homeFrames(config, source) {
    const cover = normalizeFrame(config.homeCoverFrame, source);
    if (config.homeCoverFrame?.source !== source) cover.fit = "contain";
    const background = normalizeFrame(config.backgroundFrame, source);
    if (config.backgroundFrame?.source !== source && config.coverId === source) {
        background.y = clamp(config.bg_offset, 0, 100, 0) / 100;
    }
    return {cover, background};
}

export async function updateHomeFrames(config, source, frames, persist) {
    const previous = structuredClone(config);
    config.coverId = source;
    config.homeCoverFrame = normalizeFrame(frames.cover, source);
    config.backgroundFrame = normalizeFrame(frames.background, source);
    try {
        await persist();
    } catch (error) {
        for (const key of Object.keys(config)) delete config[key];
        Object.assign(config, previous);
        throw error;
    }
}
