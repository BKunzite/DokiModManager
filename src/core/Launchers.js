let launchers_list = {}

export class LauncherAbstract {
    constructor(list) {
        this.list = list;
    }

    functions() {
        return this.list;
    }
}

export function addLauncher(name, launcher) {
    launchers_list[name] = launcher;
}

export function getLaunchers() {
    return launchers_list;
}

export function getLauncher(name) {
    return launchers_list[name]
}

export function clearLaunchers() {launchers_list = {}}