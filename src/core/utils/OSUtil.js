import Logger from "./Logger";

let os_type;

export const OS = {
    "TYPE": {
        WINDOWS: "windows",
        LINUX: "linux",
        MAC: "mac",
    },
    "EXECUTABLE": {
        WINDOWS: "DDLC.exe",
        LINUX: "DDLC.sh",
        LINUX_OTHER: "LinuxLauncher.sh",
        MAC: "DDLC.app"
    },
};

export const DDLC_FOLDER_REGEX = new RegExp((getOSType() === OS.TYPE.MAC ? OS.EXECUTABLE.MAC : OS.EXECUTABLE.WINDOWS) + "|renpy", "g");

export const INVALID_MAC_BINARIES = [
    "DDLC",
    "python",
    "pythonw",
    "zsync",
    "zsyncmake",
    "librenpython.dylib"
]

export function getOSType() {
    if (os_type !== undefined) return os_type;
    if (navigator.userAgent.toLowerCase().includes("linux")) {
        os_type = OS.TYPE.LINUX;
    } else if (navigator.userAgent.toLowerCase().includes("mac")) {
        os_type = OS.TYPE.MAC;
    } else {
        os_type = OS.TYPE.WINDOWS;
    }
    return os_type;
}

class DefaultClass {
    Init() {
        Logger.log("Running on OS.TYPE-" + getOSType().toUpperCase());
        if (getOSType() === OS.TYPE.LINUX || getOSType() === OS.TYPE.MAC) {
            /*
                Reloading the webpage is broken on webkit! We love webkit!
            */

            window.addEventListener("keydown", (e) => {
                if (e.key === "r" && e.ctrlKey) {
                    e.preventDefault();
                    location.reload();
                }
            });
            document.documentElement.setAttribute("os-type", "linux");
        }
    }
}

export default new DefaultClass();
