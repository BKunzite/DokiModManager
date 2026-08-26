let launchers_list = {}

export class LauncherAbstract {
    list = {}

    constructor(list) {
        this.list = list;
    }

    /**
     * Launcher Abstract Class
     * @returns {{item: HTMLElement, location: String, absolute_location: String, preload: {String: HTMLElement}, isFavorite: Boolean, nameId: String, getOrder: () => Number, preloadImages: () => Promise<void>, getData: () => {}, setAuthor: (author: String) => Promise<void>, getPath: () => Promise<String>,
     *     getName: () => Promise<String>, resetOrder: () => void, setPinned: (pinned: boolean=any) => Promise<void>, open: () => Promise<void>,
     *     get_time: () => Promise<Number>, path: () => Promise<void>, setCover: (coverId: number) => Promise<void>, onFavorite: () => Promise<void>, close: () => Promise<void>, leftClick: () => Promise<void>}}
     */
    getFunctions() {
        return this.list;
    }
}

export function addLauncher(name, launcher) {
    launchers_list[name] = launcher;
}

export function getLaunchers() {
    return launchers_list;
}

/**
 *
 * @param name
 * @return {LauncherAbstract | undefined}
 */

export function getLauncher(name) {
    return launchers_list[name]
}

export function clearLaunchers() {
    launchers_list = {}
}