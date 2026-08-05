import {fileTerminator} from "../utils/FileSystem";
import HTMLHelper from "../utils/HTMLHelper";
import {formatModName} from "../utils/TextUtil";
import {TranslationUtil} from "../utils/TranslationUtil";

class DownloadingObject {
    #url = ""
    #file = ""
    #path = ""
    #percent = 0
    #percentGoal = 0
    #updateString = ""
    #div;
    #header;
    #subheader;
    #progressBar;
    #progressBarFill;
    #cancel;

    constructor(url, path, percent) {
        this.#url = url
        this.#path = path
        this.#file = path.split(fileTerminator).pop()
        this.#percent = percent

        this.#div = document.createElement("div")
        this.#header = document.createElement("header")
        this.#subheader = document.createElement("header")
        this.#progressBar = document.createElement("div")
        this.#progressBarFill = document.createElement("div")
        this.#cancel = document.createElement("header")

        this.#div.classList.add("downloads-element")
        this.#header.classList.add("downloads-element-name")
        this.#subheader.classList.add("downloads-element-percent")
        this.#progressBar.classList.add("downloads-bar")
        this.#progressBarFill.classList.add("downloads-bar-fill")
        this.#cancel.classList.add("downloads-element-cancel")

        this.#subheader.textContent = "Preparing..."

        let fileName = this.#file
        if (this.#file.includes("\.")) {
            let split = this.#file.split("\.")
            split.pop()
            fileName = split.join(".")
        } 

        this.#header.textContent = formatModName(fileName)

        this.#progressBar.append(this.#progressBarFill)
        this.#div.append(this.#header, this.#subheader, this.#progressBar, this.#cancel)
        document.getElementById("downloads-list-inner").append(this.#div)

        const noneOf = document.getElementById("downloads-none")
        if (noneOf !== null) noneOf.remove()
    }

    getUrl() {
        return this.#url
    }

    getPath() {
        return this.#path
    }

    getPercent() {
        return this.#percent
    }

    setUpdateString(str) {
        this.#updateString = str
        this.#subheader.textContent = this.#updateString
    }

    getUpdateString() {
        return this.#updateString
    }

    setPercentFrames(val) {
       this.#percentGoal = Math.min(val, 100)
    }

    setPercent(val) {
        this.#percent = Math.min(val, 100)
        this.#progressBarFill.style.width = (17 * (this.#percent / 100)).toFixed(2) + "rem"
    }

    tick() {
        if (this.#percentGoal > 0) this.setPercent(Math.min(this.#percent + (this.#percentGoal - this.#percent) * 0.2, 100))
    }

    complete() {
        this.#percent = 100
        this.#div.remove()
        this.#progressBarFill.remove()
        this.#progressBar.remove()
        this.#header.remove()
        this.#subheader.remove()
        this.#cancel.remove()

        this.#div = undefined
        this.#header = undefined
        this.#subheader = undefined
        this.#progressBar = undefined
        this.#progressBarFill = undefined
        this.#cancel = undefined

        const noneOf = document.getElementById("downloads-none")
        if (noneOf === null) {
            const noneOf = document.createElement("header")
            noneOf.id = "downloads-none"
            noneOf.classList.add("downloads-none")
            noneOf.textContent = TranslationUtil.of("no-downloads")
            document.getElementById("downloads-list-inner").append(noneOf)
        }
    }
}

class DownloadsManager {
    #ongoingDownloads = {}

    startDownload(url, path) {
        this.#ongoingDownloads[url] = new DownloadingObject(url, path, 0)
        return this.#ongoingDownloads[url]
    }

    /**
     *
     * @param url
     * @returns {DownloadingObject} object
     */
    getDownload(url) {
        return this.#ongoingDownloads[url]
    }

    complete(url) {
        const download = this.#ongoingDownloads[url]
        download.complete()
        this.#ongoingDownloads[url] = undefined
        return download
    }

    swap(urlA, urlB) {
        const downloadA = this.#ongoingDownloads[urlA]
        const downloadB = this.#ongoingDownloads[urlB]
        this.#ongoingDownloads[urlA] = downloadB
        this.#ongoingDownloads[urlB] = downloadA
    }

    tick() {
        for (const url in this.#ongoingDownloads) {
            if (this.#ongoingDownloads[url] !== undefined) {
                this.#ongoingDownloads[url].tick()
            }
        }
    }
}

export default new DownloadsManager()