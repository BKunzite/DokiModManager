import {getOSType, OS} from "./OSUtil";

/**
 * Replaces \\\\ with operating-system-specific terminator.
 * @param {string} path
 * @returns {string}
 */

export function terminatePath(path) {
    return path.replace(/\\/g, fileTerminator);
}

export let fileTerminator = getOSType() === OS.TYPE.WINDOWS ? "\\" : "/"