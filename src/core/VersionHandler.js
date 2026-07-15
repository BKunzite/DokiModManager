export const CLIENT_VERSION = "1.7.0-release"
const BRANCH = "current_ver.txt"
const VERSION_URL = "https://raw.githubusercontent.com/BKunzite/DokiModManager/refs/heads/main/" + BRANCH

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

export async function getLatest() {
    try {
        const response = await fetch(VERSION_URL)

        if (!response.ok) {
            console.warn(`Client Version Check Failed! Returned Status ${response.status}`)
            return CLIENT_VERSION;
        }

        const version = await response.text();
        return version.trim()
    } catch (error) {
        console.warn(`Client Version Check Failed! Error with: ${error}`)
    }
    return CLIENT_VERSION;
}

/**
 * Returns Whether There Is A Newer Version Available
 * @example ```javascript
 * let should_update = await shouldUpdate();
 * let latest_version_id = (await getLatest()).split("\n")[0];
 * let should_update_lambda = () => latest_version_id !== CLIENT_VERSION;
 *
 * assert(should_update_manic() === should_update);
 *
 * console.log(should_update);
 * ```
 * @returns {Promise<boolean>}
 */

export async function shouldUpdate() {
    let newest_version = await getLatest();
    return newest_version.split("\n")[0] !== CLIENT_VERSION;
}