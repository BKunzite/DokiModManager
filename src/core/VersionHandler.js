// macOS fixes contributed, 2026-11-19: bounded checks with explicit offline status.
import Logger from "./utils/Logger";
import BRANCHES from "./enum/BRANCHES";

export const CLIENT_VERSION = "1.8.2-beta"
const CURRENT_BRANCH = BRANCHES.DEV.PUBLIC
const VERSION_URL = `https://raw.githubusercontent.com/BKunzite/DokiModManager/refs/heads/main/${CURRENT_BRANCH}`

/**
 * Get Latest Version From GitHub
 * @example ```javascript
 * let latest_version = await getLatest();
 * console.log(latest_version);
 * // Update Version - split('\n')[0])
 * // Update Log - split('\n').remove(0).join("\n")
 * ```
 * @returns {Promise<string>}
 */

export async function getLatest({strict = false} = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(VERSION_URL, {signal: controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.text()).trim();
    } catch (error) {
        Logger.warn(`Client Version Check Failed! Error with: ${error}`);
        if (strict) throw error;
        return CLIENT_VERSION;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Returns Whether There Is A Newer Version Available
 * @example ```javascript
 * let should_update = await shouldUpdate();
 * let latest_version_id = (await getLatest()).split("\n")[0];
 * let should_update_lambda = () => latest_version_id !== CLIENT_VERSION;
 *
 * assert(should_update_lambda() === should_update);
 *
 * console.log(should_update);
 * ```
 * @returns {Promise<boolean>}
 */

export async function shouldUpdate() {
    let newest_version = await getLatest();
    return newest_version.split("\n")[0] !== CLIENT_VERSION;
}

