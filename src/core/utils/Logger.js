import {invoke} from "@tauri-apps/api/core";

let logs = []
let Logger = {}
const oldLog = console.log;
const oldWarn = console.warn;
const oldError = console.error

Logger.log = (...msg) => {
    invoke("sync_log", {msg: msg.join(" ")}).then(r => {})
    oldLog(getTimeStamp(), msg.join(" "))
    addConstant(msg.join(" "), false, Date.now())
}

Logger.warn = (...msg) => {
    invoke("sync_log", {msg: "(WARN) " + msg.join(" ")}).then(r => {})
    oldWarn(getTimeStamp(), msg.join(" "))
    addConstant(msg.join(" "), true, Date.now())
}

Logger.error = (...msg) => {
    invoke("sync_log", {msg: "(ERROR) " + msg.join(" ")}).then(r => {})
    oldError(getTimeStamp(), msg.join(" "))
    addConstant(msg.join(" "), true, Date.now())
}

Logger.instant = () => {
    return structuredClone(logs)
}

Logger.sendEvent = async (event_name = "event", options = {}) => {
    await invoke("tracker", {
        event: event_name,
        props: options
    })
}

function getTimeStamp() {
    return "[" + new Date().toISOString().split("T")[1].replace("Z", "") + "]"
}

function addConstant(msg, isWarn, timestamp) {
    logs.push({
        msg: msg,
        isWarn: isWarn,
        timestamp: timestamp
    })
}

export default Logger;

console.log = (...args) => Logger.log("(Silent)", getTimeStamp(), ...args)
console.warn = (...args) => Logger.warn("(SilentWarn)", getTimeStamp(), ...args)

Logger.log("[MARKER] Debugger Attached.");