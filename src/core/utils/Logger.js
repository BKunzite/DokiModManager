import {covers} from "./ImageUtils";

let logs = []
let Logger = {}
const oldLog = console.log;
const oldWarn = console.warn;

Logger.log = (msg) => {
    oldLog(getTimeStamp(), msg)
    addConstant(msg, false, Date.now())
}

Logger.warn = (msg) => {
    oldWarn(getTimeStamp(), msg)
    addConstant(msg, true, Date.now())
}

Logger.instant = () => {
    return structuredClone(logs)
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

console.log = (...args) => oldLog("(Silent)", getTimeStamp(), ...args)
console.warn = (...args) => oldWarn("(Silent)", getTimeStamp(), ...args)

Logger.log("[MARKER] Debugger Attached.");