import Logger from "./Logger";

let os_type;

export const OS = {
    "TYPE": {
        WINDOWS: "windows",
        LINUX: "linux",
        MAC: "mac"
    },
    "EXECUTABLE": {
        WINDOWS: "DDLC.exe",
        LINUX: "DDLC.sh",
        LINUX_OTHER: "LinuxLauncher.sh"
    }
}

export function getOSType() {
    if (os_type !== undefined) return os_type;
    if (navigator.userAgent.toLowerCase().includes('linux')) {
        os_type = OS.TYPE.LINUX;
    } else if (navigator.userAgent.toLowerCase().includes('mac')) {
        os_type = OS.TYPE.MAC;
    } else {
        os_type = OS.TYPE.WINDOWS;
    }
    return os_type;
}

class DefaultClass {
    Init() {
        document.documentElement.setAttribute("os-type", getOSType())
        Logger.log("Running on OS.TYPE-" + getOSType().toUpperCase())
        if (getOSType() === OS.TYPE.LINUX) {
            window.addEventListener('keydown', (e) => {
                if (e.key === "r" && e.ctrlKey) {
                    e.preventDefault();
                    location.reload()
                }
            })
        }
    }
}

export default new DefaultClass()