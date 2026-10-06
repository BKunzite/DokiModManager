import { getOSType, OS } from "./OSUtil";

export let fileTerminator = getOSType() === OS.TYPE.WINDOWS ? "\\" : "/";
export const INVALID_FOLDER_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]|[. ]$/g
export const INVALID_FOLDER_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i
const archiveRegex = /\.(zip|rar|tar|7z|gz)$/i;

/**
 * Replaces \\\\ with operating-system-specific terminator.
 * @param {string} path
 * @returns {string}
 */

export function terminatePath(path) {
  return path.replace(/\\/g, fileTerminator);
}

export function supportedModPackage(selectedPath) {
  return archiveRegex.test(selectedPath) ||
    selectedPath.endsWith("scripts.rpa");
}
