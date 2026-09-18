import {invoke} from "@tauri-apps/api/core";

let logs = [];
let batchedLogs = [];
let Logger = {};
const oldLog = console.log;
const oldWarn = console.warn;
const oldError = console.error;

Logger.log = (...msg) => {
    batchedLogs.push(msg.join(" "));
    oldLog(getTimeStamp(), ...msg);
    addConstant(msg.join(" "), false, Date.now());
};

Logger.info = (...msg) => Logger.log(...msg);

Logger.warn = (...msg) => {
    batchedLogs.push("(WARN) " + msg.join(" "));
    oldWarn(getTimeStamp(), msg.join(" "));
    addConstant(msg.join(" "), true, Date.now());
};

Logger.error = (...msg) => {
    batchedLogs.push("(ERROR) " + msg.join(" "));
    oldError(getTimeStamp(), msg.join(" "));
    addConstant(msg.join(" "), true, Date.now());
};

Logger.instant = () => {
    return structuredClone(logs);
};

Logger.sendEvent = async (event_name = "event", options = {}) => {
    await invoke("tracker", {
        event: event_name,
        props: options,
    });
};

Logger.tick = () => {
    if (batchedLogs.length === 0) return;
    let temp = batchedLogs;
    batchedLogs = [];
    invoke("sync_log", {msgs: temp}).then(() => {
    });
};

/**
 * @deprecated
 * @param args
 * @constructor
 */
Logger.DEBUG_USE_ONLY = (...args) => {
    oldLog(...args)
}

function getTimeStamp() {
    return "[" + new Date().toISOString().split("T")[1].replace("Z", "") + "]";
}

function addConstant(msg, isWarn, timestamp) {
    logs.push({
        msg: msg,
        isWarn: isWarn,
        timestamp: timestamp,
    });
}

console.log = (...args) => Logger.log("(Silent)", getTimeStamp(), ...args);
console.warn = (...args) => Logger.warn("(SilentWarn)", getTimeStamp(), ...args);

Logger.log("[Logger.js/MARKER] Debugger Attached.");

export default Logger;