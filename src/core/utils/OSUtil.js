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
        os_type = "linux";
    } else if (navigator.userAgent.toLowerCase().includes('mac')) {
        os_type = "mac";
    } else {
        os_type = "windows";
    }
    return os_type;
}

export function updateOSType() {
    document.documentElement.setAttribute("os-type", getOSType())
}