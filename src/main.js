// Vue
import {createApp} from "vue";

// Tauri Based Imports
import {invoke} from '@tauri-apps/api/core';
import {listen} from "@tauri-apps/api/event";
import {open} from '@tauri-apps/plugin-dialog';
import {openUrl} from "@tauri-apps/plugin-opener";
import {
    create,
    readDir,
    readFile,
    readTextFile,
    remove,
    watch,
    writeFile,
    writeTextFile,
    mkdir
} from '@tauri-apps/plugin-fs';
import {isDir, isExist, metadata} from "tauri-plugin-fs-pro-api";

// Pages
import App from "./App.vue";
import Desktop from "./Desktop.vue";

// Utils
import {getImage} from "./core/ImageUtils";
import {CLIENT_VERSION, getLatest, shouldUpdate} from "./core/VersionHandler";
import {TRANSLATION_TABLE, Translation, TRANSLATION_ELEMENT_MAP} from "./core/Translation.js"
import {Base64} from 'js-base64';
import {addLauncher, LauncherAbstract, getLauncher, getLaunchers, clearLaunchers} from "./core/Launchers.js"

// Assets
import sound_beep from './assets/select.ogg';
import sound_boop from './assets/hover.ogg';
import sound_click from './assets/pageflip.ogg';
import dart_sfx from './assets/dart_sfx.mp3';

// Profile Data
let selected_button = null;
let selected_name = ""
let current_profile = ""
let current_profile_data = {}
let concurrent_profile_data = {}
let profile_path = "";
let original_profile = "";
let current_game_data_path = "";
let rename_target = "";

// Tutorial Variables

let tutorial_complete = false;
let tutorial_step = 0;
let tutorial_pointer = null

// Config Variables

let bg_offset = 0;
let current_bg_max = 0;
let localConfig = {
    path: "",
    config: {}
}
let save_path = "";
let user_name = "";

// Misc

let lastInputLength = 0
let logs = []
let start = Date.now();
let currentEntry = ""
let covers = []
let background_cover = 0
let total_time = 0;
let mouse_cover_available = false;
let alert_path = undefined
let selectedPath;
let local_path;
let observer;
let reset = false;
let focused = true;
let previous_app = null
let preload_covers = {}
let fileTerminator = "\\"

// Loading Bar
let goal_slow_bar = -1
let current_bar = 0;

// Downloads Detector
let part_file_size = 0;
let last_change = 0;
let part_file = null;

// Event Variables (Save for when next season arrives)

// --CHRISTMAS MUSIC-- let jingle_audio = new Audio(jingle);

// CONSTANTS
const SHOULD_ESCAPE_HTML_PATTERN = /["&'<>]/;

const CLIENT_THEME_ENUM = [
    "NATSUKI", "MONIKA", "YURI", "SAYORI", "WINTER", "NORD", "CREAM", "NEON", "HACKER"
]

const CLIENT_THEMES = {
    NATSUKI: {
        primary_color: [254, 179, 188],
        primary_color_saturated: [229, 127, 166],
        image: "Chibi/chibi_natsuki.png"
    },
    MONIKA: {
        primary_color: [128, 239, 128],
        primary_color_saturated: [118, 138, 118],
        image: "Chibi/chibi_monika.png"
    },
    YURI: {
        primary_color: [108, 69, 130],
        primary_color_saturated: [52, 24, 55],
        image: "Chibi/chibi_yuri.png"

    },
    SAYORI: {
        primary_color: [227, 138, 131],
        primary_color_saturated: [192, 100, 107],
        image: "Chibi/chibi_sayori.webp"

    },
    WINTER: {
        primary_color: [220, 220, 220],
        primary_color_saturated: [120, 120, 120],
        image: "Other_Theme_Icons/snowflake.svg"
    },
    NORD: {
        primary_color: [59, 66, 82],
        primary_color_saturated: [136, 192, 208],
        image: "Other_Theme_Icons/crown.png"
    },
    CREAM: {
        primary_color: [245, 245, 220],
        primary_color_saturated: [210, 105, 30],
        image: "Other_Theme_Icons/sour-cream.png"
    },
    NEON: {
        primary_color: [240, 6, 153],
        primary_color_saturated: [0, 245, 255],
        image: "Other_Theme_Icons/neon-planet.png"
    },
    HACKER: {
        primary_color: [0, 255, 0],
        primary_color_saturated: [0, 0, 0],
        image: "Other_Theme_Icons/hacker-svgrepo-com.svg"
    }
}

const HEART_EMPTY = "&#62920;";
const HEART_FULL = "&#62919;";

/**
 * Initialize Translations
 *
 * @param {string} lang - Language to load (ex. "en" - english, "fr" - french)
 * @param {boolean} first - First load attempt?
 */

function loadTranslation(lang, first) {
    if (TRANSLATION_TABLE[lang] === undefined) lang = "en";
    if (Translation.getLanguage() !== lang) {
        invoke('tracker', {
            event: 'language',
            props: {name: lang}
        }).then();
    }

    Translation.setLanguage(lang);

    if (!tutorial_complete) {
        document.getElementById("tutorial-title").textContent = tutorial_step === 0 ? Translation.of("tutorial-text") : Translation.sub("tutorial").of(tutorial_step).title;
        document.getElementById("tutorial-context").textContent = tutorial_step === 0 ? Translation.of("tutorial-context") : Translation.sub("tutorial").of(tutorial_step).context;
        if (tutorial_pointer == null) {
            if (tutorial_step === 8) {
                document.getElementById("tutorial-no").textContent = Translation.of("end")
            } else {
                document.getElementById("tutorial").textContent = Translation.of("next")
                document.getElementById("tutorial-no").textContent = Translation.of("cancel")
            }
        } else {
            document.getElementById("tutorial").textContent = Translation.of("yes")
            document.getElementById("tutorial-no").textContent = Translation.of("no")
        }
    }

    for (let i = 0; i < TRANSLATION_ELEMENT_MAP.length; i++) {
        const element = document.getElementById(TRANSLATION_ELEMENT_MAP[i].id);
        if (element) {
            element[TRANSLATION_ELEMENT_MAP[i]["type"]] = Translation.of(TRANSLATION_ELEMENT_MAP[i].key);
        }
    }

    getImage(Translation.sub("data").of("flag"), {}).then(url => {
        document.getElementById("language-flag").src = url
    });
    document.getElementById("language-text").textContent = lang;

    if (currentEntry === "") {
        if (!first) {
            home_main().then()
        }
    } else {
        getLauncher(currentEntry).functions().leftClick().then();
    }
}

/**
 * Preloads and image given a path to optimize
 * image loading speeds.
 * @param {string} src - Path to the image
 * @returns {Promise<void>}
 */

function preloadImage(src) {
    return new Promise(async (resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = await getImage(src, covers);
        img.onerror = reject;
        resolve(img);
    });
}

// Appends Message To User Console

async function globLog(msg) {
    console.log(msg)
    await addConstant(msg, false, Date.now())
}

async function globWarn(msg) {
    console.warn(msg)
    await addConstant(msg, true, Date.now())
}

async function addConstant(msg, isWarn, timestamp) {
    logs.push({
        msg: msg,
        isWarn: isWarn,
        timestamp: timestamp
    })
}

// Removes Right Click Menu

document.oncontextmenu = document.body.oncontextmenu = function () {
    return false;
}

/**
 * Syncs covers with images stored.
 * @returns {Promise<void>}
 */

async function sync_covers() {
    const imageLocation = terminatePath("\\store\\images")

    covers = [
        "house.webp",
        "wallpapers.png",
        "natsuki.jpg",
        "yuri.jpg",
        "sayori.jpg",
        "monika.png"
    ]

    preload_covers = {}

    for (const cover of covers) {
        preload_covers[cover] = await preloadImage(cover);
    }

    if (await isDir(local_path + imageLocation)) {
        for (const image of await readDir(local_path + imageLocation)) {
            if (image.name.endsWith(".png") || image.name.endsWith(".jpg") || image.name.endsWith(".jpeg") || image.name.endsWith(".webp")) {
                const path = local_path + imageLocation + fileTerminator + image.name;
                covers.push(path);
                preload_covers[path] = await preloadImage(path);
            }
        }
    }

}

/**
 * Replaces \\\\ with operating-system-specific terminator.
 * @param {string} path
 * @returns {string}
 */

function terminatePath(path) {
    return path.replace(/\\/g, "/");
}

/**
 * Loads local config which includes background cover id
 * and the total amount of time you have played mods
 *
 * Also includes whether it has warned you to
 * save downloads to the user's download folder
 * @param path Path To Config File
 */

async function loadConfig(path) {
    let hasConfig = false;
    let configPath = path + fileTerminator + "client-config.json";
    const localFiles = await readDir(path);
    let hostname = await invoke("get_host_name", {})

    let configData = {
        coverId: 0,
        totalTime: 0,
        warn_path: false,
        tutorial: false,
        theme: "NATSUKI",
        language: "",
        version: "0.0.0-release",
        bg_offset: 0,
        user_name: hostname
    }

    local_path = path;

    // Detects Config

    for (const localEntry of localFiles) {
        if (localEntry.name === "client-config.json") {
            hasConfig = true;
            break;
        }
    }

    if (!hasConfig) {
        if (selectedPath !== "" && selectedPath !== undefined) {
            for (const entry of await readDir(selectedPath)) {
                if (entry.isDirectory) {
                    const localFiles2 = await readDir(selectedPath + fileTerminator + entry.name);
                    let hasConfig2 = false;
                    let configPath2 = selectedPath + fileTerminator + entry.name + fileTerminator + ".ddmm.config.json";
                    for (const localEntry of localFiles2) {
                        if (localEntry.name === ".ddmm.config.json") {
                            hasConfig2 = true;
                            break;
                        }
                    }
                    if (hasConfig2) {
                        let kconfigData = {
                            author: Translation.of("unknown"),
                            time: 0,
                            size: 0,
                            favorite: false,
                            coverId: 0
                        }
                        kconfigData = JSON.parse(await readTextFile(configPath2));
                        if (!isNaN(kconfigData.time)) {
                            total_time += kconfigData.time;
                        }
                    }
                }
            }
            configData.totalTime = total_time;
        }
        await create(configPath)
        const contents = JSON.stringify(configData, null, "\t");
        await writeTextFile(configPath, contents);
    } else {
        try {
            configData = JSON.parse(await readTextFile(configPath));
        } catch (e) {
            console.error("Failed to parse config file: " + e);

            document.getElementById("changelog").classList.remove("hide")
            document.getElementById("changelog-title").textContent = "Critical Error | Cannot Load Config"
            document.getElementById("changelog-text").textContent = "File: " + configPath + "\n\n" + e + "\n\nData:\n" + (await readTextFile(configPath)).split("\n").map((line, index) => index + "|  " + line).join("\n")
            document.getElementById("changelog-update").textContent = Translation.of("update")
            document.getElementById("changelog-ignore").textContent = Translation.of("end")
            document.getElementById("changelog-ignore").style.right = "calc(2rem + " + document.getElementById("changelog-update").getBoundingClientRect().width + "px)"

            let response = await new Promise(resolve => {
                document.getElementById("changelog-update").addEventListener("mouseup", async () => {
                    resolve(true)
                })
                document.getElementById("changelog-ignore").addEventListener("mouseup", async () => {
                    resolve(false)
                })
            });

            document.getElementById("changelog").classList.add("hide")

            if (response) {
                await invoke("open_path", {
                    path: configPath
                })
            }

            exit_program();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    configData.theme = configData.theme || "NATSUKI";
    configData.coverId = configData.coverId || 0;
    configData.totalTime = configData.totalTime || 0;
    configData.tutorial = configData.tutorial || false;
    configData.version = configData.version || "0.0.0-release";
    configData.language = configData.language || "";
    configData.bg_offset = configData.bg_offset || 0;
    configData.user_name = configData.user_name || hostname;

    console.log("Cover Id: " + configData.coverId)

    localConfig = {
        path: configPath,
        config: configData
    }

    total_time = configData.totalTime;
    background_cover = configData.coverId;
    tutorial_complete = configData.tutorial;
    bg_offset = configData.bg_offset;
    user_name = configData.user_name;

    Translation.setLanguage(configData.language);

    if (tutorial_complete) {
        document.getElementById("warn").remove()
    }
}

/**
 * Removes all cover images, then creates all new cover images with
 * their respective aspect ratio.
 *
 * @param {boolean} first_time Scroll To The Left
 * @returns {Promise<void>}
 */

async function update_cover_images(first_time) {
    await sync_covers()
    const images = document.getElementById("images")

    if (!first_time) {
        for (const child of document.querySelectorAll(".image-picker-cover")) {
            child.remove()
        }
    }

    for (const cover in preload_covers) {
        let cover_img = preload_covers[cover];
        let x = 1;
        let y = 1;
        let aspect = cover_img.naturalWidth / cover_img.naturalHeight;

        const div = document.createElement("div");
        const img = cover_img.cloneNode(true);

        div.classList.add("image-picker-cover");
        img.alt = covers.indexOf(cover) + " | " + cover
        img.loading = "lazy";
        img.decoding = "async";

        if (aspect > 1.6) {
            x = 2;
            img.classList.add("image-picker-cover-img");
        } else if (aspect > 1.2) {
            x = 2;
            y = 2;
            img.classList.add("image-picker-cover-img-vertical");
        } else if (aspect < 0.9) {
            y = 2;
            img.classList.add("image-picker-cover-img-vertical");
        } else {
            if (aspect > 1) {
                img.classList.add("image-picker-cover-img-vertical");
            } else {
                img.classList.add("image-picker-cover-img");
            }
        }

        img.addEventListener("mouseup", async (e) => {
            if (currentEntry !== "" && e.button === 0) {
                await getLauncher(currentEntry).functions().setCover(covers.indexOf(cover));
            } else if (e.button === 0) {
                background_cover = covers.indexOf(cover)
                await setCover(background_cover)
            }
            play(sound_beep)
            document.getElementById("profile-blur").classList.add("hide")
            document.getElementById("image-picker-bg").classList.remove("image-picker-visible");
        })

        div.classList.add("image-" + x + "x" + y);
        div.appendChild(img);
        document.getElementById("image-picker-bg").appendChild(div);
    }

    if (!first_time) {
        for (const cover of document.querySelectorAll(".covers-cover")) {
            cover.remove()
        }
    }

    for (let i = covers.length - 1; i >= 0; i--) {
        const cover_bg = document.createElement("div");
        const cover_img = preload_covers[covers[i]].cloneNode(true);
        const cover_text = document.createElement("button");

        cover_img.classList.add("covers-image");

        cover_bg.classList.add("covers-cover");

        cover_text.classList.add("covers-text");
        cover_text.innerHTML = "&#60450;"

        cover_img.addEventListener("mouseup", () => {
            background_cover = i;
            setCover(background_cover)
        })

        if (i > 5) {
            cover_text.addEventListener("mouseup", () => {
                remove(covers[i]);
                covers.splice(i, 1);
                setTimeout(async () => {
                    let scroll = images.scrollLeft;
                    await update_cover_images()
                    await setCover(background_cover);
                    images.scrollLeft = scroll;
                }, 100)
            })
            cover_bg.appendChild(cover_text);
        }

        cover_bg.appendChild(cover_img);
        images.appendChild(cover_bg);
    }

    if (first_time) {
        setTimeout(async () => {
            images.scrollLeft = -1000000000;
        }, 100)
    }
}

/**
 * Saves Current Config (./client-config.json)
 * @returns {Promise<void>}
 */

async function saveConfig() {
    // console.log("Saving Config @ " + Date.now())
    localConfig.config.coverId = background_cover;
    localConfig.config.totalTime = total_time;
    localConfig.config.version = CLIENT_VERSION;
    localConfig.config.tutorial = tutorial_complete;
    localConfig.config.language = Translation.getLanguage();
    localConfig.config.bg_offset = bg_offset;
    localConfig.config.user_name = user_name;
    await writeTextFile(localConfig.path, JSON.stringify(localConfig.config, null, "\t"))
}

// Plays interaction sounds

function play(song) {
    let beep = new Audio(song)
    beep.volume = 0.5;

    beep.play().then(() => {
    })
}

/**
 * Imports A Mod Async
 * @param path Location Of The Mod
 * @returns {Promise<void>}
 */

async function import_mod(path) {
    let selectedPath = path
    if (selectedPath === undefined) {
        selectedPath = await open({
            directory: false,
            multiple: false,
            filters: [{
                name: 'Zip',
                extensions: ['zip', 'rar']
            }],
            title: 'Select Your Mod\'s Zip File'
        });
        await invoke('tracker', {
            event: 'manual_download',
            props: {name: selectedPath.split(fileTerminator).pop()}
        });
    }
    if (selectedPath != null) {
        if (selectedPath.endsWith(".zip") || selectedPath.endsWith(".rar") || selectedPath.endsWith("scripts.rpa")) {
            setLoadingBar(0);
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            document.getElementById("loadingsub").textContent = "Importing Mod " + selectedPath
            alert_path = selectedPath;
            showContainers(false)
            await invoke("import_mod", {
                path: selectedPath
            })
        } else {
            confirm("Not A Zip File!")
        }
    }
}

/**
 * Sets The Current Cover/Background
 * @param id Index of the cover
 * @returns {Promise<void>}
 */

async function setCover(id) {
    if (id > covers.length - 1) {
        id = 0;
    }
    let image = preload_covers[covers[id]].src;
    if (image === undefined) {
        image = await getImage(id, covers)
    }

    document.getElementById("cove").style.backgroundImage = 'url("' + image + '")';

    if (currentEntry === "") {
        document.getElementById("bg").style.backgroundImage = 'url("' + image + '")';
        const img = new Image();
        img.src = image;

        img.onload = () => {
            current_bg_max = img.naturalHeight * (1200 / img.naturalWidth);
            document.getElementById("bg").style.height = (current_bg_max) + "px";
            document.getElementById("bg").style.backgroundPositionY = ((600 - current_bg_max) * (bg_offset / 100)) + "px";
            img.remove()
        };
        await saveConfig()
    }
}

/**
 * Sets current theme
 * @param {string} name ENUM for current theme
 * @param {boolean} first First Time Setting Theme?
 * @returns {Promise<void>}
 */

async function setTheme(name, first) {
    if (!(name in CLIENT_THEMES)) {
        name = "NATSUKI";
    }

    document.getElementById("chibi").src = await getImage(CLIENT_THEMES[name].image, covers);
    document.body.style.setProperty("--primary-color", CLIENT_THEMES[name].primary_color)
    document.body.style.setProperty("--primary-color-saturated", CLIENT_THEMES[name].primary_color_saturated)

    localConfig.config.theme = name
    if (!first) {
        await saveConfig()
    }
}

/**
 * Exits and Closes the mod manager
 */

function exit_program() {
    document.getElementById("loader").classList.remove("hide")
    document.getElementById("main").classList.add("hide")
    document.getElementById("loadinghead").textContent = "Closing..."
    document.getElementById("loadingsub").textContent = "Saving Data..."
    setLoadingBar(0, false)
    setLoadingBar(100, true)

    setTimeout(async () => {
        await invoke("close");
    }, 1000)
}

/**
 * Creates A Screenshot Div With
 * Lazy Image Loading and
 * Viewable
 *
 * @param {string} src Image Source/URL
 * @param {string} entryName Launcher Name
 * @param {string} dir Directory Of Image
 * @param {string} image Image Name
 * @param {string} entry Launcher Name 2
 * @returns {HTMLDivElement} Created Div
 */

function createScreenshotDiv(src, entryName, dir, image, entry) {
    const newScreenshot = document.createElement("img")
    const cover_text = document.createElement("button");
    const path_text = document.createElement("button");

    const cover_bg = document.createElement("div");
    newScreenshot.decoding = "async"
    newScreenshot.loading = "lazy"
    newScreenshot.classList.add("screenshots-image")
    newScreenshot.src = src;
    newScreenshot.addEventListener("mouseup", async () => {
        document.getElementById("view-image").src = await getImage(dir + fileTerminator + image, []);
        document.getElementById("view-image").classList.add("zoom")
        document.getElementById("view-background").classList.remove("hide")
    })
    cover_text.addEventListener("click", async () => {
        await remove(dir + fileTerminator + image);
        await getLauncher(entryName).functions().leftClick();
        if (entry.preload[image]) {
            await getLauncher(entry).functions().preloadImages()
        }
    })
    path_text.addEventListener("click", async () => {
        await getLauncher(entryName).functions().path();
    })
    path_text.classList.add("screenshots-path");
    path_text.innerHTML = "&#60792;"
    cover_text.classList.add("screenshots-text");
    cover_text.innerHTML = "&#60450;"
    cover_bg.appendChild(path_text)
    cover_bg.appendChild(cover_text);
    cover_bg.appendChild(newScreenshot);
    cover_bg.classList.add("screenshots-cover");
    return cover_bg
}

/**
 * Set Install Location Directory
 * OR Loads Mods
 *
 * @param {string} path Location Of Mods To Load
 * @returns {Promise<void>}
 */

async function requestDirectory(path) {
    let ppath = undefined;
    if (path === undefined) {
        ppath = await open({
            directory: true,
            multiple: false,
            title: 'Select Your DDLC Directory'
        });
        if (ppath === null || ppath === undefined) {
            return
        }
        selectedPath = ppath;
        await invoke("path_select", {
            path: selectedPath
        })
    } else {
        selectedPath = path;
    }
    if (ppath !== undefined || selectedPath !== undefined) {
        if (ppath !== undefined) {
            selectedPath = ppath;
        }

        for (const element in getLaunchers()) {
            getLauncher(element).functions()["item"].remove();
        }

        clearLaunchers()
        const files = await readDir(selectedPath);

        document.getElementById("search").value = ""
        document.getElementById("loader").classList.remove("hide")
        document.getElementById("main").classList.add("hide")
        document.getElementById("nummods").textContent = files.length.toString();

        // Update Mods List

        let finished_mods = 0;
        let mods_to_complete = 0;
        let finished = []

        for (const entry of files) {
            if (entry.isDirectory) {
                mods_to_complete++;
                add_mod(entry.name)
                    .then(() => {
                        finished.push(entry.name)
                        finished_mods++;
                    })
                    .catch(err => {
                        finished_mods++;
                        globWarn("Failed To Add Mod: " + entry.name + "\n" + err)
                    })
            }
        }

        let interval = setInterval(async () => {
            if (finished_mods === mods_to_complete) {
                setLoadingBar(100)
                clearInterval(interval)
                await globLog("Finished Loading DDMM - Enjoy!")
                document.getElementById("loadingsub").textContent = "Loaded Mods | Loading GUI"

                setTimeout(() => {
                    play(sound_click)
                    document.getElementById("loader").classList.add("hide")
                    document.getElementById("main").classList.remove("hide")
                }, 500)
            } else {
                setLoadingBar((finished_mods / mods_to_complete) * 100)
                document.getElementById("loadingsub").textContent = "Loaded " + finished_mods + "/" + mods_to_complete + " Mods -> " + finished.join(" | ")
                finished = []

            }
        }, 100)
        return new Promise(async (resolve) => {
            setInterval(async () => {
                if (finished_mods === mods_to_complete) {
                    resolve()
                }
            }, 100)
        })

    }

}

/**
 * Add Mods to List
 * @param {string} name Name Of Mod To Add
 * @returns {Promise<void>}
 */

async function add_mod(name) {
    if (!await isExist(selectedPath + fileTerminator + name)) {
        await globWarn("Mod " + name + " Does Not Exist!")
        return
    }
    const localFiles = await readDir(selectedPath + fileTerminator + name);
    // Find Correct Directory

    let dir = selectedPath + fileTerminator + name;
    let isInDir = false;
    for (const localEntry of localFiles) {
        if (localEntry.name === "DDLC.exe" || localEntry.name === "renpy") {
            isInDir = true;
            break;
        }
    }

    if (!isInDir) {
        dir = selectedPath + fileTerminator + name + fileTerminator + "DDLC-1.1.1-pc"
        if (await isDir(dir)) {
            for (const localEntry of await readDir(dir)) {
                if (localEntry.name === "DDLC.exe" || localEntry.name === "renpy") {
                    isInDir = true;
                    break;
                }
            }
        }
    }

    if (!isInDir) {
        await globWarn(dir + " Does Not Contain DDLC.exe")
        return;
    }

    // Create SideButton And Load Config

    let hasConfig = false;
    let configPath = selectedPath + fileTerminator + name + fileTerminator + ".ddmm.config.json";
    let configData = {
        author: Translation.of("unknown"),
        time: 0,
        size: 0,
        favorite: false,
        coverId: 0,
        renpy: undefined,
        executable: undefined,
        credits: undefined,
        pinned: false,
        last_played: -1
    }

    let gameExePath;
    let modCredits;
    let saveModData = async () => {
        const contents = JSON.stringify(configData, null, "\t");
        await writeTextFile(configPath, contents);
    };

    for (const localEntry of localFiles) {
        if (localEntry.name === ".ddmm.config.json") {
            hasConfig = true;
            break;
        }
    }

    if (hasConfig) {
        let contents = await readTextFile(configPath);
        try {
            let c = JSON.parse(contents);
            for (const key in c) {
                configData[key] = c[key];
            }
        } catch (e) {
            await globWarn("Failed To Parse Config File For Mod: " + configPath)
            hasConfig = false;
        }
    }

    if (!hasConfig) {
        await create(configPath)
        const data = await metadata(selectedPath + fileTerminator + name);
        configData.size = data.size;
        await saveModData();
    }

    if (configData.executable === undefined || configData.credits === undefined || configData.executable.length === 0 || !await isExist(dir + fileTerminator + configData.executable)) {
        for (const localEntry of await readDir(dir)) {
            if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe") && localEntry.name !== "DDLC.exe" && gameExePath === undefined) {
                gameExePath = localEntry.name;
            }

            if (localEntry.name.toLowerCase().includes("credit") && modCredits === undefined) {
                modCredits = await readTextFile(dir + fileTerminator + localEntry.name);
            }
        }

        if (gameExePath === undefined) {
            gameExePath = "DDLC.exe"
            if (!await isExist(dir + fileTerminator + gameExePath)) {
                await globWarn("No functional executable found in " + dir)
                throw new Error("No executable found!\nPath: " + dir + "\nExecutable: " + gameExePath + "\nFiles: " + localFiles.map(v => v.name).join(", "))
            }
        }

        configData.executable = gameExePath;
        configData.credits = modCredits;

        if (modCredits !== undefined) {
            modCredits = htmlEscape(modCredits).replaceAll("\n", "<br>")
        }

        await saveModData();
    } else {
        gameExePath = configData.executable;
        modCredits = configData.credits !== undefined ? htmlEscape(configData.credits).replaceAll("\n", "<br>") : undefined;
    }

    if (configData.coverId === undefined || configData.coverId === null) {
        configData.coverId = 0;
    }

    let shorthand = name.replace("ddlc-", "").replace("ddlc", "").replace("-", " ");
    const sidetext = document.createElement("header");
    const normalText = "<span style=\"font-family: Icon,serif\">&#60810;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";
    const favoriteText = "<span style=\"font-family: Icon,serif\">&#60938;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";
    const pinnedText = "<span style=\"font-family: Icon,serif\">&#61496;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";

    let launch_time = Date.now();
    sidetext.classList.add("sidebutton");
    sidetext.id = shorthand;

    if (configData.favorite) {
        sidetext.classList.add("favorite")
    } else {
        sidetext.classList.remove("favorite")
    }

    if (configData.pinned) {
        sidetext.classList.add("pinned")
    } else {
        sidetext.classList.remove("pinned")
    }

    if (configData.pinned) {
        sidetext.innerHTML = pinnedText
    } else if (configData.favorite) {
        sidetext.innerHTML = favoriteText
    } else {
        sidetext.innerHTML = normalText
    }

    observer.observe(sidetext);
    const launcher = new LauncherAbstract({
        item: sidetext,
        location: selectedPath + fileTerminator + name,
        absolute_location: dir,
        preload: {},
        isFavorite: configData.favorite,
        nameId: name.toLowerCase(),
        preloadImages: async () => {
            let images = 0;
            getLauncher(name).functions().preload = {}

            for (const localEntry of await readDir(dir)) {
                if (localEntry.name.includes("screenshot")) {
                    getLauncher(name).functions().preload[localEntry.name] = await createScreenshotDiv(await getImage(dir + fileTerminator + localEntry.name, []), name, dir, localEntry.name, name);
                    getLauncher(name).functions().preload[localEntry.name].classList.add("preload-image")
                    images++

                    if (images >= 2) {
                        break
                    }
                }
            }
        },
        getData: async () => {
            return configData
        },
        setAuthor: async (author) => {
            configData.author = author;
            await saveModData();
        },
        getPath: async () => {
            return selectedPath
        },
        getName: async () => {
            return name
        },
        setPinned: async (b) => {
            if (b === undefined) {
                if (configData.pinned === undefined || configData.pinned == null) {
                    b = false
                } else {
                    b = !configData.pinned;
                }
            }

            configData.pinned = b;
            if (configData.pinned) {
                sidetext.innerHTML = pinnedText
            } else if (configData.favorite) {
                sidetext.innerHTML = favoriteText
            } else {
                sidetext.innerHTML = normalText
            }

            if (configData.pinned) {
                play(dart_sfx)
            }

            await set_pin(configData.pinned)
            if (configData.pinned) {
                sidetext.classList.add("pinned")
            } else {
                sidetext.classList.remove("pinned")
            }
            await saveModData();
        },
        open: async () => {
            await invoke('tracker', {
                event: 'game_launch',
                props: {mod: name}
            });
            showContainers(false)
            await update_concurrent_game()
            document.getElementById("pill").classList.remove("hide")
            document.getElementById("pill-files").classList.remove("hide")
            document.getElementById("pill-contains").classList.remove("hide")
            document.getElementById("pill-profile").style.backgroundImage = 'url("' + preload_covers[covers[configData.coverId]].src + '")';
            setTimeout(async () => {
                play(sound_beep)
                launch_time = Date.now();
                const dirFiles = await readDir(dir);

                if (configData.renpy === "" || configData.renpy === undefined) {
                    configData.renpy = await getRenpy(dir);
                    await saveModData();
                }

                if (gameExePath !== "") {
                    await invoke("launch", {
                        path: dir + fileTerminator + gameExePath,
                        id: name,
                        renpy: configData.renpy || Translation.of("unknown")
                    })
                }
            }, 1000)


        },
        get_time: async () => {
            return Date.now() - launch_time;
        },
        path: async () => {
            await invoke("open_path", {
                path: dir
            })
        },
        setCover: async (coverId) => {
            configData.coverId = coverId;
            await saveModData();
            await setCover(configData.coverId);
        },
        onFavorite: async () => {
            configData.favorite = !configData.favorite;
            sidetext.classList.toggle("favorite", configData.favorite)
            if (configData.pinned) {
                sidetext.innerHTML = pinnedText
            } else if (configData.favorite) {
                sidetext.innerHTML = favoriteText
            } else {
                sidetext.innerHTML = normalText
            }
            getLauncher(name).functions().isFavorite = configData.favorite;
            await saveModData();
            document.getElementById("covertext").innerHTML = configData.favorite ? HEART_FULL : HEART_EMPTY;
        },
        close: async () => {
            if (alert_path === undefined) {
                showContainers(true)
            }
            play(sound_click)
            const playTime = Date.now() - launch_time;
            await invoke('tracker', {
                event: 'game_close',
                props: {
                    mod: name,
                    length: Math.floor(playTime / 3600000) + Translation.of("h") + " " + (Math.floor(playTime / 60000) % 60) + Translation.of("m") + " " + (Math.floor(playTime / 1000) % 60) + "s"
                }
            });
            total_time += playTime;
            configData.time += playTime;
            const data = await metadata(selectedPath + fileTerminator + name);
            configData.size = data.size;
            configData.last_played = Date.now();
            document.getElementById("pill").classList.add("hide")
            document.getElementById("pill-files").classList.add("hide")
            document.getElementById("pill-contains").classList.add("hide")

            await saveModData();
            await saveConfig()
            await getLauncher(name).functions().leftClick();
        },
        leftClick: async () => {
            currentEntry = name;
            await setCover(configData.coverId);
            await set_pin(configData.pinned);

            const pin_holder = document.getElementById("pin-holder");
            if (pin_holder.style.top !== "") {
                pin_holder.style.removeProperty("left")
                pin_holder.style.removeProperty("top")
            }

            const screenshotWanderer = await readDir(dir);

            if (configData.renpy === "" || configData.renpy === undefined) {
                configData.renpy = await getRenpy(dir);
                await saveModData();
            }

            let renpy = configData.renpy;
            let screenshots = false;
            let images = []

            while (document.getElementById("screenshots").children.length > 0) {
                const child = document.getElementById("screenshots").children.item(document.getElementById("screenshots").children.length - 1);
                if (!child.classList.contains("preload-image")) {
                    URL.revokeObjectURL(child.getElementsByClassName("screenshots-image")[0].src);
                    child.getElementsByClassName("screenshots-image")[0].src = ""
                    child.children[Symbol.iterator]().forEach(child => child.remove())
                }
                child.remove()
            }

            for (const localEntry of screenshotWanderer) {
                if (localEntry.name.startsWith("screenshot")) {
                    screenshots = true;
                    if (getLauncher(name).functions().preload[localEntry.name] !== undefined) {
                        document.getElementById("screenshots").appendChild(getLauncher(name).functions().preload[localEntry.name]);
                        continue;
                    }
                    images.push(
                        localEntry.name
                    )
                }
            }

            if (renpy === undefined) {
                renpy = Translation.of("unknown") + " (Try Reinstalling; If its still broken, please create a git issue on this)";
            }

            renpy = name + "<br>Renpy: " + htmlEscape(renpy) + "<br>Custom Exe: " + ((gameExePath !== undefined && gameExePath !== "" && !gameExePath.toString().endsWith("DDLC.exe")) ? "Yes | " + gameExePath : "No") + "<br><br>Credits: <br>" + (modCredits !== undefined ? modCredits : "None Found!");
            document.getElementById("covertext").innerHTML = configData.favorite ? HEART_FULL : HEART_EMPTY;
            play(sound_boop)
            const min = Math.floor(configData.time / 60000);

            const msSinceLastPlayed = Date.now() - configData.last_played;
            let lastPlayed = Translation.of("never");

            if (configData.last_played !== -1) {
                let date = new Date(configData.last_played).toLocaleString();
                if (msSinceLastPlayed < 6000) {
                    lastPlayed = Translation.of("just-now");
                } else if (msSinceLastPlayed < 86_400_000) {
                    const is_prefix = Translation.getLanguage() === "es" || Translation.getLanguage() === "fr";
                    lastPlayed = (is_prefix ? Translation.of("ago") + " " : "") + (msSinceLastPlayed >= 3_600_000 ? Math.floor(msSinceLastPlayed / 3_600_000) + Translation.of("h") + " " : "") + (Math.floor(msSinceLastPlayed / 60_000) % 60) + Translation.of("m") + " " + (!is_prefix ? Translation.of("ago") : "");
                } else if (msSinceLastPlayed < 172_800_000) {
                    lastPlayed = Translation.of("yesterday");
                } else if (msSinceLastPlayed) {
                    lastPlayed = date
                }
            }

            if (configData.size === 0) {
                updateDisplayInfo(name, configData.author, "Reading...", Math.floor(min / 60) + Translation.of("h") + " " + Math.floor(min % 60) + Translation.of("m"), renpy, "Never").then(() => {
                })
                setTimeout(async () => {
                    let data = await metadata(selectedPath + fileTerminator + name);
                    configData.size = data.size;
                    if (currentEntry === name) {
                        updateDisplayInfo(name, configData.author, (configData.size / 1048600) > 1000 ? (Math.floor(configData.size / 1_048_600_000) + " GB") : (Math.floor(configData.size / 1048600) + " MB"), Math.floor(min / 60) + Translation.of("h") + " " + Math.floor(min % 60) + Translation.of("m"), renpy, lastPlayed).then(() => {
                        })
                    }
                    data = null
                }, 0)
            } else {
                updateDisplayInfo(name, configData.author, (configData.size / 1048600) > 1000 ? (Math.round(configData.size / 1_048_600_00) / 10 + " GB") : (Math.floor(configData.size / 1048600) + " MB"), Math.floor(min / 60) + Translation.of("h") + " " + Math.floor(min % 60) + Translation.of("m"), renpy, lastPlayed).then(() => {
                })
            }

            if (!screenshots) {
                document.getElementById("screenshots-header").classList.add("hide")
                document.getElementById("screenshots-parent").classList.add("hide")
                document.getElementById("info").classList.remove("info")
                document.getElementById("info").classList.add("expanded")
                document.getElementById("setinfo-header").style.left = "16rem";
            } else {
                document.getElementById("screenshots").scrollLeft = 0;
                document.getElementById("screenshots").onscroll = async () => {
                    document.getElementById("screenshots").onscroll = null

                    for (const image_url of images) {
                        let imageS = createScreenshotDiv(await getImage(dir + fileTerminator + image_url, []), name, dir, image_url, name)
                        document.getElementById("screenshots").appendChild(
                            imageS
                        );
                        imageS.getElementsByClassName("screenshots-image")[0].decode().then(() => {
                            URL.revokeObjectURL(imageS.getElementsByClassName("screenshots-image")[0].src);
                            caches.delete(imageS.getElementsByClassName("screenshots-image")[0].src);
                        }).catch(err => {
                            console.warn("Failed To Load Image: " + dir + fileTerminator + image_url + " Error: " + err)
                        })

                    }
                }

                document.getElementById("screenshots-header").classList.remove("hide")
                document.getElementById("screenshots-parent").classList.remove("hide")
                document.getElementById("info").classList.remove("expanded")
                document.getElementById("info").classList.add("info")
                document.getElementById("setinfo-header").style.left = "30rem";
            }

            renpy = null
        }
    })
    addLauncher(name, launcher)
    launcher.functions().preloadImages().then(() => {
    });

    sidetext.addEventListener("click", async () => {
        if (currentEntry === name) return;
        launcher.functions().leftClick().then(() => {
        });
    })

    document.getElementById("modlist").appendChild(sidetext)
}

/**
 * Escapes HTML To Prevent Potential XSS Attacks
 * @param {string} text HTML To Escape
 * @returns {string} Escaped HTML Text
 */

function htmlEscape(text) {
    if (SHOULD_ESCAPE_HTML_PATTERN.exec(text) === null) {
        return text;
    }

    let string = ""
    for (const char of text) {
        switch (char) {
            case "&":
                string += "&amp;";
                break;
            case "<":
                string += "&lt;";
                break;
            case ">":
                string += "&gt;";
                break;
            case "\"":
                string += "&quot;";
                break;
            case "'":
                string += "&#039;";
                break;
            default:
                string += char;
                break;
        }
    }
    return string;
}

/**
 * Gets Ren'Py Version
 *
 * Different Cases
 *
 * init.py -> version_tuple = VersionTuple(x, y, z)
 *
 * init.py -> version_tuple = (x, y, z, vc_version)
 *
 * vc_version.py -> version_tuple = u'x.y.z'
 *
 * @example ```javascript
 * let renpy_version_string = await getRenpy("C:\\Path\\To\\The\\Mod");
 *
 * console.log(renpy_version_string) // 8.0.1
 * ```
 *
 * @param {string} dir Directory Of Ren'Py Mod
 * @returns {Promise<string>}
 */

async function getRenpy(dir) {
    let renpy;
    const dirFiles = await readDir(dir + fileTerminator + "renpy");
    for (const localEntry of dirFiles) {
        if (localEntry.name === "__init__.py") {
            const code = await readTextFile(dir + fileTerminator + "renpy" + fileTerminator + localEntry.name);
            const lines = code.split("\n");
            for (const line of lines) {
                if (line.startsWith("version_tuple = ") && !line.includes("*")) {
                    renpy = (line + "").replace("version_tuple = (", "").replace(", vc_version)", "").replaceAll(", ", ".");
                    break;
                } else if (line.trim().startsWith("version_tuple = ") && line.trim().includes("(8") && !line.includes("*")) {
                    renpy = (line.trim() + "").replace("version_tuple = ", "").replace("VersionTuple", "").replace("(", "").replace(", vc_version)", "").replaceAll(", ", ".");
                    break;
                }
            }
        }
        if (localEntry.name === "vc_version.py" && renpy === undefined) {
            const code = await readTextFile(dir + fileTerminator + "renpy" + fileTerminator + localEntry.name);
            const lines = code.split("\n");
            for (const line of lines) {
                if (line.startsWith("version = ")) {
                    renpy = (line + "").replace("version = ", "").replaceAll("'", "").replace("u", "");
                    break;
                }
            }
        }

    }
    return renpy
}

/**
 * Hide/Show Container (Main UI)
 * @param {boolean} show Should Show Containers
 */

function showContainers(show) {
    if (show) {
        if (tutorial_pointer != null) {
            document.getElementById("warn").classList.remove("hide")
            tutorial_pointer.classList.remove("hide")
            document.getElementById("tutorial").dispatchEvent(new MouseEvent("mouseup", {}))
        }
        document.getElementById("modlist").classList.remove("hide")
        document.getElementById("container-boarder").classList.remove("hide")
        document.getElementById("container-shadow").classList.remove("hide")
        document.getElementById("search").classList.remove("hide")
        document.getElementById("container").classList.remove("hide")

    } else {
        if (tutorial_pointer != null) {
            document.getElementById("warn").classList.add("hide")
            tutorial_pointer.classList.add("hide")
        }
        if (!document.getElementById("pill").classList.contains("hide")) {
            document.getElementById("pill").classList.add("hide")
            document.getElementById("pill-files").classList.add("hide")
            document.getElementById("pill-contains").classList.add("hide")

        }
        document.getElementById("modlist").classList.add("hide")
        document.getElementById("container-boarder").classList.add("hide")
        document.getElementById("container-shadow").classList.add("hide")
        document.getElementById("search").classList.add("hide")
        document.getElementById("container").classList.add("hide")
    }
}

/**
 * Get Text Width
 * @param {string} text Text To Get Width Of
 * @param {string} font Font Name
 * @returns {number} Width Of Text
 */

function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

/**
 * Updates Current UI Displayed Info
 * @example ```javascript
 * let mod_name = "Hello World";
 * let author = "BKunzite";
 * let storage_size = "100 MB";
 * let time_played = "0h 100m";
 * let description = mod_name + "<br>Ren'Py 8.1";
 *
 * await updateDisplayInfo(mod_name, author, storage_size, time_played, description);
 * ```
 * @param {string} mod Mod Name
 * @param {string} author Author Name
 * @param {string} space Storage Space Taken
 * @param {string} time Time Played
 * @param {string} renpy Ren'PY Version/Description
 * @param {string} lastTime Last Time Played
 * @returns {Promise<void>}
 */

async function updateDisplayInfo(mod, author, space, time, renpy, lastTime) {
    document.getElementById("pin-holder").classList.remove("hide")

    document.getElementById("modtitle").value = mod.replace("ddlc-", "").replace("ddlc", "").replace("-", " ")
    document.getElementById("modtitle").classList.remove("hide");
    document.getElementById("modinfo").classList.remove("hide");
    document.getElementById("cove").classList.remove("hide");
    document.getElementById("language-list").classList.add("language-list-hide");

    if (author.length > 0) {
        currentEntry = mod;
        document.getElementById("covers").classList.add("hide");
        document.getElementById("setinfo-header").classList.remove("hide");
        document.getElementById("info").classList.remove("hide");
        if (renpy !== undefined) {
            document.getElementById("info").innerHTML = renpy;
        } else {
            document.getElementById("info").textContent = "No Information Found!";
        }
        document.getElementById("delete").classList.remove("hide");
        document.getElementById("reset-save").classList.remove("hide");
        document.getElementById("path").classList.remove("hide");
        document.getElementById("extract").classList.remove("hide");
        document.getElementById("delete-save").classList.remove("hide");
        document.getElementById("play").classList.remove("hide");
        document.getElementById("optionsmenu").classList.add("hide");
        document.getElementById("cover-up").classList.add("hide");
        document.getElementById("cover-down").classList.add("hide");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon,serif;\">&#62038;</span><input class='author-header' autocomplete='off' spellcheck='false' id='authinput' placeholder='" + author + "'><span style=\"font-family: Icon; padding-left: 20px;\">&#60755;</span> " + space + " <span style=\"font-family: Icon; padding-left: 20px;\">&#61966;</span> " + time + " <span style=\"font-family: Icon; padding-left: 20px;\">&#61974;</span> " + lastTime;
        document.getElementById("authinput").style.width = Math.min(getTextWidth(author, "normal 1rem Aller"), 225) + "px"
        if (space !== "Reading...") {
            document.getElementById("authinput").addEventListener("input", async (e) => {
                document.getElementById("authinput").style.width = Math.min(getTextWidth(e.target.value, "normal 1rem Aller"), 225) + "px"
            })
            document.getElementById("authinput").addEventListener("blur", async () => {
                await setAuthor();
            })
            document.getElementById("authinput").addEventListener("keydown", async (e) => {
                if (e.key === "Enter") {
                    document.getElementById("authinput").blur();
                }
            })
        } else {
            document.getElementById("authinput").readOnly = true;
        }
    } else {
        currentEntry = ""
        setCover(background_cover).then(() => {
        })
        let min = Math.floor(total_time / 60000);
        document.getElementById("screenshots-header").classList.add("hide");
        document.getElementById("screenshots-parent").classList.add("hide");
        document.getElementById("covers").classList.remove("hide");
        document.getElementById("setinfo-header").classList.add("hide");
        document.getElementById("info").classList.add("hide");
        document.getElementById("delete").classList.add("hide");
        document.getElementById("reset-save").classList.add("hide");
        document.getElementById("path").classList.add("hide");
        document.getElementById("extract").classList.add("hide");
        document.getElementById("delete-save").classList.add("hide");
        document.getElementById("play").classList.add("hide");
        document.getElementById("cover-up").classList.remove("hide");
        document.getElementById("cover-down").classList.remove("hide");
        document.getElementById("optionsmenu").classList.remove("hide");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon,serif;\">&#62038;</span> Kunzite <span style=\"font-family: Icon,serif; padding-left: 20px;\">&#61966;</span> " + Math.floor(min / 60) + Translation.of("h") + " " + (min % 60) + Translation.of("m");
    }
}

/**
 * Returns To Home Screen
 * @returns {Promise<void>}
 */

async function home_main() {
    // await updateDisplayInfo("Hi " + (await invoke("whois", {})) + "!", "", "", "") -- This could leak the user's full name; deprecated
    document.getElementById("covertext").innerHTML = ""
    await set_pin(false)
    document.getElementById("pin-holder").classList.add("hide")
    await updateDisplayInfo(Translation.of("greet") + " " + user_name + "!", "", "", "", "", "")
}

/**
 * Sets Current Author From Input (id: authinput)
 * @returns {Promise<void>}
 */

async function setAuthor() {
    if (currentEntry === "") return;
    document.getElementById("authinput").blur()
    let value = document.getElementById("authinput").value.trimEnd();
    if (value === "") {
        const author = (await getLauncher(currentEntry).functions().getData()).author;
        document.getElementById("authinput").value = author;
        document.getElementById("authinput").placeholder = author;
        document.getElementById("authinput").style.width = Math.min(getTextWidth(author, "normal 1rem Aller"), 225) + "px"

    } else {
        await getLauncher(currentEntry).functions().setAuthor(value);
        await getLauncher(currentEntry).functions().leftClick();
    }
}

/**
 * Sends Keep Alive
 * @returns {Promise<void>}
 */

async function keepAlive() {
    await invoke('tracker', {
        event: 'keep_alive',
        props: {name: currentEntry}
    });
}

/**
 * Interval: Update Concurrent Game Info
 * @returns {Promise<void>}
 */

async function update_concurrent_game() {
    if (goal_slow_bar > 0) {
        setLoadingBar(0, true)
    }
    if (!document.getElementById("loader").classList.contains("hide")) return;
    if (!document.getElementById("modlist").classList.contains("hide") || alert_path !== undefined) {
        if (!document.getElementById("pill").classList.contains("hide")) {
            document.getElementById("pill").classList.add("hide")
            document.getElementById("pill-files").classList.add("hide")
            document.getElementById("pill-contains").classList.add("hide")

        }
        return
    }

    if (document.getElementById("pill").classList.contains("hide")) {
        document.getElementById("pill").classList.remove("hide")
        document.getElementById("pill-files").classList.remove("hide")
        document.getElementById("pill-contains").classList.remove("hide")

    }

    const playTime = await getLauncher(currentEntry).functions().get_time();
    const second = Math.floor(playTime / 1000) % 60;
    const min = Math.floor(playTime / 60000);
    const name = await getLauncher(currentEntry).functions().getName() + " ";
    const author = (await getLauncher(currentEntry).functions().getData()).author;
    const time = Math.floor(min / 60) + "h " + (min % 60) + "m " + second + "s";

    document.getElementById("pill-game").textContent = name
    document.getElementById("pill-author").textContent = author
    document.getElementById("pill-time").textContent = time
}

/**
 * Sets Current Loading Bar Percent
 * @param {number} percent Percent Of The Bar From 0 to 100
 * @param {boolean} isSlowMode Should Slowly Lerp To Value
 */

function setLoadingBar(percent = 0, isSlowMode = false) {
    if (isSlowMode && percent !== 0) {
        goal_slow_bar = percent
    }
    if (isSlowMode && goal_slow_bar > 0) {
        current_bar += (goal_slow_bar - current_bar) * 0.1
        percent = current_bar;
    } else {
        current_bar = percent
        goal_slow_bar = -1
    }

    percent = Math.min(Math.max(percent, 0), 100)
    let width = 125 * (percent / 100)
    document.getElementById("loading-bar-fill").style.width = width + "vh";
}

/**
 * Christmas Snowflake Animation
 * @returns {Promise<void>}
 */

async function snowflake() {
    if (!focused) return;
    const snowflake = document.createElement("div");
    const x = Math.floor(Math.random() * window.innerWidth);
    const size = Math.random() * 30 + 20;
    const speed = Math.random() * 5 + 2;
    snowflake.style.left = x + "px";
    snowflake.style.width = size + "px";
    snowflake.style.height = size + "px";
    snowflake.classList.add("snowflake");
    snowflake.style.transition = "top " + speed + "s linear, rotate " + speed + "s ease";
    snowflake.style.rotate = Math.floor(Math.random() * 360) + "deg";
    snowflake.style.opacity = (Math.random() * 0.5 + 0.5).toString();
    document.body.appendChild(snowflake);

    setTimeout(() => {
        snowflake.style.top = "100%"
        snowflake.style.rotate = Math.floor(Math.random() * 360) + "deg";
        if (Math.random() > 0.5) {
            snowflake.style.zIndex = "-1"
        }
    }, 250)

    setTimeout(() => {
        snowflake.remove()
    }, 250 + (speed * 1100))
}

/**
 * Rename Mod
 * @returns {Promise<void>}
 */

async function rename_mod() {
    if (currentEntry === "") return;
    let value = document.getElementById("modtitle").value.trimStart().trimEnd();
    let name = await getLauncher(currentEntry).functions().getName();
    if (value === name) return;
    if (value !== name && value.length !== 0) {

        let oldName = (await getLauncher(currentEntry).functions().getPath()) + fileTerminator + name;
        let newName = (await getLauncher(currentEntry).functions().getPath()) + fileTerminator + value;

        if (value.match(/[<>:"/\\|?*\u0000-\u001F]|[. ]$/g) || value.match(/^(con|prn|aux|nul|com\d|lpt\d)$/i) || value.length > 100) {
            confirm("The Name '" + value + "' is invalid!")
            document.getElementById("modtitle").value = currentEntry;
            return;
        }

        try {
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            document.getElementById("loadingsub").textContent = "Renaming Mod"
            setLoadingBar(0, false)
            setLoadingBar(100, true)
            await invoke("rename_dir", {
                path: oldName,
                newName: newName,
                id: value
            })

        } catch (e) {
            confirm("Cannot Rename The File Due To:\n\n" + e)
        }

    } else {
        document.getElementById("modtitle").value = currentEntry;
    }
}

/**
 * Update Profiles
 * @param {string} path Path of profiles
 * @returns {Promise<void>}
 */

async function update_profiles(path) {
    /*
    <div class="profile-button">
              <header class="profile-item-name">Default</header>
              <button class="profile-item-delete profile-item-source" id="down-profile">&#60445;</button>
              <button class="profile-item-select profile-item-source" id="select-profile">&#60285;</button>
              <button class="profile-item-drag profile-item-source" id="copy-profile">&#62782;</button>

            </div>
     */
    if (document.getElementById("profiles").children !== null) {
        document.getElementById("profiles").replaceChildren();
    }

    const profiles_path = path + "--profiles";
    const current_info_path = profiles_path + fileTerminator + ".info.json";

    profile_path = profiles_path;
    if (!await isDir(profiles_path)) {
        await mkdir(profiles_path);
    }
    if (!await isExist(current_info_path)) {
        await writeTextFile(current_info_path, "{}");
    }
    let profiles_data = JSON.parse(await readTextFile(current_info_path));

    current_game_data_path = path;
    selected_name = profiles_data.selected == null ? "profile-Default" : profiles_data.selected;
    current_profile = profiles_data.current == null ? "Default" : profiles_data.current;
    original_profile = current_profile;
    current_profile_data = profiles_data.profiles == null ? {"0": "Default"} : profiles_data.profiles;
    concurrent_profile_data = {}

    if (!await isExist(get_profile_path(current_profile))) {
        await writeTextFile(get_profile_path(current_profile), "{}");
    }

    const profile_files = await readDir(profiles_path);
    for (const profile of profile_files) {
        if (profile.name.includes(".ddmm.profile.json")) {
            const name = profile.name.replace(".ddmm.profile.json", "");
            console.log(name)
            console.log(current_profile_data)
            let profile_spot = undefined;
            for (const key in current_profile_data) {
                if (current_profile_data[key] === "profile-" + name) {
                    profile_spot = key;
                    break
                }
            }
            console.log(profile_spot)
            create_profile(name, profile_spot);
        }
    }
    document.getElementById("profile-bg").classList.remove("hide")
}

function get_profile_path(name) {
    if (name === null) {
        return profile_path + fileTerminator + "null"
    }
    return profile_path + fileTerminator + (name === undefined ? currentEntry : name).replace("profile-", "") + ".ddmm.profile.json"
}

async function save_profile_data() {
    for (const key in current_profile_data) {
        const profile_path = get_profile_path(current_profile_data[key]);
        console.log(profile_path)
        if (!await isExist(profile_path)) {
            current_profile_data[key] = undefined;
        }
    }

    const sorted = Object.entries(current_profile_data)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .reduce((acc, [key, value], index, array) => {
            const currentKey = parseInt(key);
            const prevKey = index > 0 ? parseInt(array[index - 1][0]) : -1;
            for (let i = prevKey + 1; i < currentKey; i++) {
                acc[i] = undefined;
            }
            acc[currentKey] = value;
            return acc;
        }, {});

    const profiles_data = {
        "selected": selected_name,
        "current": current_profile.replace("profile-", ""),
        "profiles": sorted
    }

    console.log(profiles_data, sorted)

    writeTextFile(profile_path + fileTerminator + ".info.json", JSON.stringify(profiles_data, null, "\t")).then(_ => {
    });
}

async function save_concurrent_profile_data() {
    let active_profile_path = get_profile_path(original_profile);
    if (!await isExist(active_profile_path)) {
        return;
    }
    await writeTextFile(active_profile_path, JSON.stringify(await get_concurrent_game_data(), null, "\t"));
}

async function get_concurrent_game_data(path) {
    if (path === undefined) path = current_game_data_path;
    let data = {}
    for (const file of await readDir(path)) {
        if (file.isDirectory) {
            console.log(path, file.name)
            data[file.name] = await get_concurrent_game_data(path + fileTerminator + file.name)
            console.log(data[file.name])
        } else {
            data[file.name] = Base64.fromUint8Array(await readFile(path + fileTerminator + file.name));
        }
    }
    return data;
}

function get_formatted_date() {
    const now = new Date();

    return now.getFullYear() + "y_" +
        String(now.getMonth() + 1).padStart(2, '0') + "m_" +
        String(now.getDate()).padStart(2, '0') + "d_" +
        String(now.getHours()).padStart(2, '0') + "hour_" +
        String(now.getMinutes()).padStart(2, '0') + "min_" +
        String(now.getSeconds()).padStart(2, '0') + "sec";
}

async function load_concurrent_profile_data(reload, reset_data) {
    if (reset_data !== true) {
        let profiles_data = JSON.parse(await readTextFile(profile_path + fileTerminator + ".info.json"));
        selected_name = profiles_data.selected == null ? "profile-Default" : "profile-" + profiles_data.selected;
        current_profile = profiles_data.current == null ? "Default" : profiles_data.current;
        original_profile = current_profile;
        current_profile_data = profiles_data.profiles == null ? {"0": "Default"} : profiles_data.profiles;
        current_profile_data = Object.fromEntries(Object.entries(current_profile_data).sort((a, b) => parseInt(a[0]) - parseInt(b[0])));
        concurrent_profile_data = {}
    }
    console.log(" should reload: " + reload + " file: " + current_profile)
    if (reload) {
        await delete_dir(current_game_data_path);

        let data = await readTextFile(get_profile_path(current_profile));
        const self_data = JSON.parse(data);

        await load_data(self_data, current_game_data_path)
    }
}

async function load_data(self_data, upstream) {
    for (const f in self_data) {
        const file = self_data[f]
        console.log(typeof file)
        if (typeof file === "object") {
            await mkdir(upstream + fileTerminator + f);
            await load_data(file, upstream + fileTerminator + f)
            continue;
        }
        let n = f.replaceAll(fileTerminator, "/");
        if (n.includes("/")) {
            for (const dir of n.split("/")) {
                if (dir === n.split("/").pop()) continue;
                await mkdir(upstream + fileTerminator + dir, {recursive: true});
            }
        }
        try {
            await writeFile(upstream + fileTerminator + f,
                Base64.toUint8Array(file));
        } catch (e) {
            console.log(f + " is not encoded in base64!")
        }
    }
}

async function set_pin(pinned) {
    document.getElementById("pin-holder").classList.toggle("pin-active", !pinned)
    document.getElementById("pin-pinned").classList.toggle("hide", !pinned)
    document.getElementById("pin-unpinned").classList.toggle("pin-unpinned-heart", !pinned)
    document.getElementById("pin-unpinned").classList.toggle("hide", pinned)
}

async function delete_dir(path) {
    if (!await isExist(path)) {
        console.log("Path does not exist: " + path)
        return;
    }
    for (const file of await readDir(path)) {
        console.log(path, file.name)
        if (file.isDirectory) {
            await delete_dir(path + fileTerminator + file.name)
        }
        await remove(path + fileTerminator + file.name);
    }
}

async function save_profile() {
    let changed_profile = original_profile !== current_profile;
    console.log(await get_concurrent_game_data())
    await save_profile_data();
    await save_concurrent_profile_data();
    await load_concurrent_profile_data(changed_profile);
}

function create_profile(profile, position) {
    if (position === undefined) {
        position = 0;
        while (current_profile_data[position] !== undefined) {
            position++;
        }
    }
    const background = document.createElement("div");
    const name = document.createElement("header");
    const b_delete = document.createElement("button");
    const b_select = document.createElement("button");
    const b_drag = document.createElement("button");

    background.classList.add("profile-button")
    background.id = "profile-" + profile;
    background.style.order = position;

    name.classList.add("profile-item-name")
    name.textContent = profile;

    b_delete.classList.add("profile-item-delete", "profile-item-source")
    b_select.classList.add("profile-item-select", "profile-item-source")
    b_drag.classList.add("profile-item-drag", "profile-item-source")

    b_delete.innerHTML = "&#60445;";
    b_select.innerHTML = "&#60543;";
    b_drag.innerHTML = "&#62782;";

    background.appendChild(name)
    background.appendChild(b_delete)
    background.appendChild(b_select)
    background.appendChild(b_drag)

    if (selected_name === background.id) {
        background.classList.add("profile-button-active")
    }

    async function onClick() {
        for (const elm of document.getElementsByClassName("profile-button")) {
            if (elm.classList.contains("profile-button-active")) {
                elm.classList.remove("profile-button-active")
            }
        }
        selected_name = background.id;
        current_profile = background.id.replace("profile-", "");
        background.classList.add("profile-button-active")
    }

    b_select.addEventListener("click", (_) => {
        if (profile === "Default") {
            confirm(Translation.of("error-profile_setname"))
            return;
        }
        rename_target = background.id.replace("profile-", "");
        document.getElementById("profile-bg").classList.add("profile-bg-covered")
        document.getElementById("input-prompt").classList.remove("hide")
        document.getElementById("input-prompt-box").value = background.id.replace("profile-", "");
        document.getElementById("input-prompt-box").focus();
    })

    background.addEventListener("mousedown", onClick)

    b_drag.addEventListener("mousedown", async (_) => {
        if (selected_button !== null) return;
        selected_name = background.id;
        selected_button = document.createElement("div");
        const text = document.createElement("header");
        text.classList.add("profile-item-name")
        text.textContent = background.id.replace("profile-", "");

        selected_button.classList.add("profile-button-hover")
        selected_button.style.top = background.getBoundingClientRect().y + "px";
        selected_button.style.left = background.getBoundingClientRect().x + "px";
        selected_button.id = background.id

        selected_button.appendChild(text)
        document.getElementById("profile-blur").appendChild(selected_button);
    })

    b_delete.addEventListener("mousedown", async (_) => {
        if (profile === "Default") {
            confirm(Translation.of("error-profile_delete"))
            return;
        }
        await remove(profile_path + fileTerminator + background.id.replace("profile-", "") + ".ddmm.profile.json");

        current_profile = "Default"
        selected_name = "profile-Default"
        for (const key in current_profile_data) {
            if (current_profile_data[key].replace("profile-", "") === background.id.replace("profile-", "")) {
                delete current_profile_data[key]
            }
        }

        background.remove()

        for (const elm of document.getElementsByClassName("profile-button")) {
            if (elm.classList.contains("profile-button-active")) {
                elm.classList.remove("profile-button-active")
            }
        }
        document.getElementById("profile-Default").classList.add("profile-button-active")

        await save_profile_data();
        await load_concurrent_profile_data(true, true);
    })

    concurrent_profile_data[profile] = {
        files: {}
    }


    isExist(get_profile_path(profile)).then(r => {
        console.log(profile, r)
        if (!r) {
            console.log("Creating Profile")
            writeTextFile(get_profile_path(profile), JSON.stringify(concurrent_profile_data[profile], null, "\t")).then(_ => {
            });
        }
    })

    current_profile_data[position] = background.id;
    document.getElementById("profiles").appendChild(background)
    return onClick;
}

function move_entries(obj, fromIndex, toIndex) {
    const values = Object.values(obj);

    if (fromIndex < 0 || fromIndex >= values.length ||
        toIndex < 0 || toIndex >= values.length) {
        throw new Error('Invalid index');
    }

    const [movedValue] = values.splice(fromIndex, 1);
    values.splice(toIndex, 0, movedValue);

    const result = {};
    values.forEach((value, index) => {
        result[index] = value;
    });

    return result;
}

// Save Profile Name

function close_profile_rename() {
    document.getElementById("profile-bg").classList.remove("profile-bg-covered")
    document.getElementById("input-prompt").classList.add("hide")
}

async function save_profile_name() {
    const name = document.getElementById("input-prompt-box").value;
    if (name.includes("profile-") || name.toLowerCase() === "default") {
        await confirm("The Name '" + name + "' is already taken!")
        return;
    }
    console.log("[MARKER] -> Rename")
    if (name !== "") {
        console.log(current_profile_data)
        for (const profile in current_profile_data) {
            console.log(current_profile_data[profile])
            if (current_profile_data[profile] === null || current_profile_data[profile] === undefined) continue;
            const comperator = (current_profile_data[profile] + "").toLowerCase().replace("profile-", "");
            const comperason = name.toLowerCase().replace("profile-", "");
            console.log(comperator, comperason, comperator === comperason)
            if (comperason === comperator || name.toLowerCase().includes("profile-")) {
                await confirm("The Name '" + name + "' is already taken!")
                return;
            }
        }
        if (name.includes("-_at-") || name.includes("/") || name.includes(fileTerminator)) {
            await confirm("The Name '" + name + "' is invalid!")
            return;
        }
        for (const key in current_profile_data) {
            if (current_profile_data[key] === "profile-" + rename_target) {
                console.log(concurrent_profile_data[rename_target], current_profile_data[key])
                document.getElementById("profile-" + rename_target).querySelector("header").textContent = name;
                document.getElementById("profile-" + rename_target).id = "profile-" + name;
                current_profile_data[key] = "profile-" + name;
                concurrent_profile_data[name] = concurrent_profile_data[rename_target];
                delete concurrent_profile_data[rename_target];

                if (selected_name === "profile-" + rename_target) {
                    selected_name = "profile-" + name;
                    current_profile = name;
                }

                console.log(rename_target)

                await writeTextFile(get_profile_path(name), await readTextFile(get_profile_path(rename_target)));
                await remove(get_profile_path(rename_target));

                break
            }
        }
    }
    await save_profile_data();
    close_profile_rename()

}

/**
 * Called Upon DOM On-Load
 * @example ```javascript
 * document.addEventListener('DOMContentLoaded', onLoad);
 * ```
 * @returns {Promise<void>}
 */

async function onLoad() {
    let start = Date.now();

    await globLog("[MARKER] Debugger Attached.")
    await globLog("Loading Observers...")

    // Listens For Rename Finishing

    listen("rename_done", async (event) => {
        await requestDirectory(selectedPath);
        while (document.getElementById("loader").classList.contains("hide")) {
        }
        const value = event.payload.text;
        await globLog(value)
        if (getLauncher(value)) {
            await getLauncher(value).functions().leftClick();
        }
    })

    document.getElementById("save-profile").addEventListener("click", async () => {
        document.getElementById("profile-bg").classList.add("hide")
        await save_profile();
        document.getElementById("profile-blur").classList.add("hide")
    });

    document.getElementById("create-profile").addEventListener("click", async () => {
        let newProfile = "Default 0";
        while (document.getElementById("profile-" + newProfile) !== null) {
            newProfile = "Default " + (parseInt(newProfile.split(" ")[1]) + 1);
        }
        await create_profile(newProfile)()
        document.getElementById("profiles").scroll({
            top: document.getElementById("profiles").scrollHeight,
            behavior: "smooth"
        })
    })

    document.getElementById("backup-profile").addEventListener("click", async () => {

        document.getElementById("profile-bg").classList.add("hide")
        await save_profile();
        document.getElementById("profile-blur").classList.add("hide")
        if (!await isDir(local_path + fileTerminator + terminatePath("store\\backup"))) {
            await mkdir(local_path + fileTerminator + terminatePath("store\\backup"));
        }
        await writeTextFile(local_path + fileTerminator + terminatePath("store\\backup") + fileTerminator + profile_path.replaceAll("\\\\", "").replaceAll(fileTerminator, "/").replaceAll(fileTerminator, "/").split("/").pop() + "-_at-" + get_formatted_date() + ".ddmm.backup.json", JSON.stringify(await get_concurrent_game_data(profile_path), null, "\t"));
        await invoke("open_path", {
            path: local_path + fileTerminator + terminatePath("store\\backup")
        })
    })

    document.getElementById("backup-load-profile").addEventListener("click", async () => {
        // create backup first -> failsafe
        let backup_select = await open({
            directory: false,
            multiple: false,
            filters: [{
                name: 'DDMM Backup Json',
                extensions: ['json']
            }],
            title: 'Select Backup File',
            defaultPath: local_path + fileTerminator + terminatePath("store\\backup") + fileTerminator
        });
        document.getElementById("profile-bg").classList.add("hide")
        await save_profile();
        if (backup_select !== null && backup_select !== undefined) {
            if (!await isDir(local_path + fileTerminator + terminatePath("store\\backup"))) {
                await mkdir(local_path + fileTerminator + terminatePath("store\\backup"));
            }
            if (!await isDir(local_path + fileTerminator + terminatePath("store\\backup\\autosave"))) {
                await mkdir(local_path + fileTerminator + terminatePath("store\\backup\\autosave"));
            }
            await writeTextFile(local_path + fileTerminator + terminatePath("store\\backup\\autosave") + fileTerminator + profile_path.replaceAll("\\\\", "\\").replaceAll(fileTerminator, "/").replaceAll(fileTerminator, "/").split("/").pop() + "-_at-" + get_formatted_date() + ".ddmm.backup.json", JSON.stringify(await get_concurrent_game_data(profile_path), null, "\t"));
            await delete_dir(profile_path);
            await load_data(JSON.parse(await readTextFile(backup_select)), profile_path);
            console.log(current_game_data_path)
            await update_profiles(current_game_data_path);
            await load_concurrent_profile_data(true);
        }
        document.getElementById("profile-blur").classList.add("hide")
    })

    /**
     * De-ref image viewer to prevent mem leak
     */

    document.getElementById("view-image").onload = () => {
        URL.revokeObjectURL(document.getElementById("view-image").src);
    }

    document.getElementById("cover-up").addEventListener("click", () => {
        if (currentEntry !== "") return;
        bg_offset += 5;
        if (bg_offset > 100) bg_offset = 0;
        document.getElementById("bg").style.backgroundPositionY = ((600 - current_bg_max) * (bg_offset / 100)) + "px";
        saveConfig();
    })

    document.getElementById("cover-down").addEventListener("click", () => {
        if (currentEntry !== "") return;
        bg_offset -= 5;
        if (bg_offset < 0) bg_offset = 100;
        document.getElementById("bg").style.backgroundPositionY = ((600 - current_bg_max) * (bg_offset / 100)) + "px";
        saveConfig();
    })

    document.getElementById("cove").addEventListener("wheel", (e) => {
        if (currentEntry !== "") return;
        bg_offset += e.deltaY / 20;
        if (bg_offset < 0) bg_offset = 0;
        if (bg_offset > 100) bg_offset = 100;

        document.getElementById("bg").style.backgroundPositionY = ((600 - current_bg_max) * (bg_offset / 100)) + "px";
        saveConfig();
    })

    document.getElementById("copy-profile").addEventListener("click", async () => {
        let newProfile = "Default 0";
        while (document.getElementById("profile-" + newProfile) !== null) {
            newProfile = "Default " + (parseInt(newProfile.split(" ")[1]) + 1);
        }
        concurrent_profile_data[newProfile] = concurrent_profile_data[original_profile];
        await create_profile(newProfile)()
        await writeTextFile(get_profile_path(newProfile), JSON.stringify(await get_concurrent_game_data(), null, "\t"));
        document.getElementById("profiles").scroll({
            top: document.getElementById("profiles").scrollHeight,
            behavior: "smooth"
        })
    })

    document.getElementById("input-prompt-box").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            save_profile_name();
        }
    })
    document.getElementById("input-prompt-agree").addEventListener("mouseup", save_profile_name)
    document.getElementById("input-prompt-cancel").addEventListener("mouseup", close_profile_rename)

    document.getElementById("profile-blur").addEventListener("mouseup", (e) => {
        if (document.getElementById("image-picker-bg").classList.contains("image-picker-visible")) {
            document.getElementById("image-picker-bg").classList.remove("image-picker-visible");
            document.getElementById("profile-blur").classList.add("hide")
        }
        if (selected_button !== null) {
            let is_hovering = null;
            for (const elm of document.getElementsByClassName("profile-button")) {
                if (elm.contains(e.target)) {
                    is_hovering = elm;
                    break;
                }
            }
            if (is_hovering === null) {

            } else {
                let moveNext = 0;
                let old_index = 0;
                for (const index in current_profile_data) {
                    const data = current_profile_data[index];
                    if (is_hovering.id === data) {
                        moveNext = parseInt(index);
                    } else if (data === selected_button.id) {
                        old_index = parseInt(index);
                    }
                }

                console.log(current_profile_data)

                console.log("moving " + old_index + " to " + moveNext)
                current_profile_data = move_entries(current_profile_data, old_index, moveNext);
                console.log(current_profile_data)
                for (const index in current_profile_data) {
                    const data = current_profile_data[index];
                    if (data === undefined || data === null || document.getElementById(data) == null) continue;
                    console.log(data, index)
                    document.getElementById(data).style.order = index;
                }
                selected_button.style.top = is_hovering.getBoundingClientRect().y + "px";
                selected_button.style.left = is_hovering.getBoundingClientRect().x + "px";
            }
            setTimeout(() => {
                const button = selected_button;
                selected_button = null;
                button.classList.add("bounce-out");
                button.classList.add("shrink")
                button.addEventListener("transitionend", () => {
                    button.remove();
                })
            }, 0)
        }
    })

    document.getElementById("profile-blur").addEventListener("mousemove", (e) => {
        if (selected_button !== null) {
            let is_hovering = null;
            for (const elm of document.getElementsByClassName("profile-button")) {
                if (elm.contains(e.target)) {
                    is_hovering = elm;
                    break;
                }
            }
            if (is_hovering === null) {
                selected_button.style.top = e.pageY + "px";
                selected_button.style.left = e.pageX + "px";
            } else {
                selected_button.style.top = is_hovering.getBoundingClientRect().y + "px";
                selected_button.style.left = is_hovering.getBoundingClientRect().x + "px";
            }
        }
    })

    // Used for sidebar animations

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("sidevisible");
            } else {
                entry.target.classList.remove("sidevisible");
            }
        });
    })

    // Initiates Sidebar Animations

    document.querySelectorAll(".sidebutton2").forEach(element => observer.observe(element));

    // Handles Horizontal Scrolling

    document.getElementById("images").addEventListener("wheel", event => {
        if (event.deltaX === 0) {
            event.preventDefault();
            document.getElementById("images").scrollBy({
                left: event.deltaY * 2,
                behavior: 'smooth'
            });
        }
    })

    document.getElementById("screenshots").addEventListener("wheel", event => {
        if (event.deltaX === 0) {
            event.preventDefault();
            document.getElementById("screenshots").scrollBy({
                left: event.deltaY * 2,
                behavior: 'smooth'
            });
        }
    })

    listen("import_done", async (event) => {
        console.log(alert_path)
        if (alert_path.includes(fileTerminator + "Downloads" + fileTerminator)) {
            await remove(alert_path);
        }
        document.getElementById("loadingsub").textContent = "Mod Imported | Loading GUI"
        setTimeout(async () => {
            if (alert_path !== undefined) {
                if (await isExist(alert_path) && alert_path.toLowerCase().includes("downloads")) {
                    remove(alert_path)
                }
                alert_path = undefined;
            }
        })
        let goal = event.payload.text;
        await add_mod(goal)
        document.getElementById("loader").classList.add("hide")
        document.getElementById("main").classList.remove("hide")
        if (getLauncher(goal)) {
            getLauncher(goal).functions().leftClick();
        } else {
            globWarn(goal + " Not Found!")
        }
        alert_path = undefined;
        showContainers(true)

    })

    // Opens Up A Spreadsheet Full Of DDLC Mods

    document.getElementById("spreadsheet").addEventListener("mouseup", async () => {


        play(sound_beep)

        window.open("https://docs.google.com/spreadsheets/d/1lgQD8o7qhdWmrwdJjbRv3u_bwdrXmpOzaixWFzLR8r4/edit?usp=sharing", 'reddit', 'width=1200,height=600')
    })

    // Opens Up DDLCMods Subreddit

    document.getElementById("reddit").addEventListener("mouseup", async () => {

        play(sound_beep)

        window.open("https://www.reddit.com/r/DDLCMods/", 'reddit', 'width=1200,height=600')
    })

    document.getElementById("select-zip").addEventListener("mouseup", async () => {
        let p = await open({
            directory: false,
            multiple: false,
            filters: [{
                name: 'Zip',
                extensions: ['zip', 'rar']
            }],
            title: 'Select DDLC Zip File'
        });
        try {
            document.getElementById("loadingsub").textContent = Translation.of("importing_zip")
            document.getElementById("select-zip").classList.add("hide")
            await invoke("set_ddlc_zip", {
                path: p
            })

        } catch (Exception) {
            document.getElementById("select-zip").classList.remove("hide")
            document.getElementById("loadingsub").textContent = Translation.of("select_zip")
        }
    })

    // Opens up DokiMods

    document.getElementById("dokimods").addEventListener("mouseup", async () => {

        play(sound_beep)

        window.open("https://dokimods.me/", 'dokimods', 'width=1200,height=600')
    })

    // Cancels Mod Install

    document.getElementById("cancel").addEventListener("mouseup", async () => {
        play(sound_beep)
        showContainers(true)
        alert_path = undefined;
        document.getElementById("alert").classList.add("hide")

    })

    // Opens Up Path Of The Mod That Is Installing

    document.getElementById("sub3").addEventListener("mouseup", async () => {
        await invoke("open_path", {
            path: alert_path
        })
    })

    // Accept Mod Download

    document.getElementById("download").addEventListener("mouseup", async () => {
        if (alert_path !== undefined) {
            play(sound_beep)
            document.getElementById("alert").classList.add("hide")
            await invoke('tracker', {
                event: 'auto_download',
                props: {name: alert_path.split(fileTerminator).pop()}
            });
            await import_mod(alert_path)
        }
    })

    globLog("Finished Loading Observers. Took " + (Date.now() - start) + "ms.")
    globLog("Loading Defaults...")

    document.getElementById("loader").classList.remove("hide")
    document.getElementById("main").classList.add("hide")
    document.getElementById("loadingsub").textContent = "Installing DDLC-Vanilla (If nothing happens after 20s, please restart the program)"

    globLog("Loading Drag/Drop")

    // Drag Drop Handling
    // This is for dragging and dropping images and mods

    listen('tauri://drag-drop', async (event) => {
        let paths = event.payload.paths;
        for (const path of paths) {
            if (path.endsWith(".zip") || path.endsWith(".rar") || path.endsWith(".rpa")) {
                await invoke('tracker', {
                    event: 'manual_download',
                    props: {}
                });
                await import_mod(path)
            } else {
                let dir = await readDir(local_path + fileTerminator + terminatePath("store\\images") + fileTerminator)
                await writeFile(local_path + fileTerminator + terminatePath("store\\images\\z_image-") + (dir.length + 1) + dir.length + "." + path.split(fileTerminator).pop().split(".").pop(), await readFile(path))

            }
        }
        setTimeout(async () => {
            await update_cover_images()
        }, 1000)
    });

    // Listener for Loading Bar Percent

    listen("set_bar", (event) => {
        let goal = event.payload.number_goal;
        setLoadingBar(event.payload.number, false)
        console.log(event.payload)
        if (goal > 0) {
            setLoadingBar(goal, true)
        }
    })

    // This is what is recieved when you import a mod
    // This is also the first handshake handler that tells the frontend (this) to listen to the downloads folder

    globLog("Finished Loading Defaults (" + (Date.now() - start) + "ms).")
    globLog("Loading Observers2")

    listen("pathRespond", async (event) => {
        if (!reset) {
            await globLog("Start Loading Pt. 2 (" + (Date.now() - start) + "ms).")

            let payloadPath = event.payload.path;
            let newest_version = await getLatest();
            await loadConfig(event.payload.local_path)
            reset = true;

            await globLog("Version Check (" + (Date.now() - start) + "ms).")

            if (newest_version.split("\n")[0] !== CLIENT_VERSION) {
                await globWarn("NOT UP TO DATE " + newest_version + " > " + CLIENT_VERSION)
                document.getElementById("version").innerHTML = `(${CLIENT_VERSION}) <u>Update!</u>`
                if (navigator.onLine) {
                    // let response = await confirm("AUTO UPDATE\nNew Update Available! (Press 'Ok' to update)\n" +
                    //     "¡Nueva actualización disponible! (Presiona 'Ok' para actualizar)\n" +
                    //     "Nouvelle mise à jour disponible ! (Appuyez sur 'Ok' pour mettre à jour)\n" +
                    //     "有新版本呀！(撳「好」開始更新)\n" +
                    //     "新しいアップデートがあります！(「Ok」を押して更新してください)\n" +
                    //     "Nova atualização disponível! (Pressione 'Ok' para atualizar)\n" +
                    //     ")\n\n" + newest_version + "\n\nUpdate Now (5-10s)?\nPress Cancel To Update Later.");

                    loadTranslation(Translation.getLanguage(), true)

                    document.getElementById("changelog").classList.remove("hide")
                    document.getElementById("changelog-title").textContent = "New Update! | " + newest_version.split("\n")[0]
                    document.getElementById("changelog-text").textContent = newest_version.split("\n").slice(1).join("\n")
                    document.getElementById("changelog-update").textContent = Translation.of("update")
                    document.getElementById("changelog-ignore").textContent = Translation.of("ignore")
                    document.getElementById("changelog-ignore").style.right = "calc(2rem + " + document.getElementById("changelog-update").getBoundingClientRect().width + "px)"
                    let response = await new Promise(resolve => {
                        document.getElementById("changelog-update").addEventListener("mouseup", async () => {
                            resolve(true)
                        })
                        document.getElementById("changelog-ignore").addEventListener("mouseup", async () => {
                            resolve(false)
                        })
                    });

                    document.getElementById("changelog").classList.add("hide")

                    if (response) {
                        await updateClient()

                        return;
                    }
                } else {
                    await globWarn("You are currently offline. Update will not be requested.")
                }
            } else {
                await globLog(CLIENT_VERSION, localConfig.config.version)
                document.getElementById("version").textContent = `(${CLIENT_VERSION})`
                if (localConfig.config.version !== CLIENT_VERSION) {
                    await saveConfig()
                    document.getElementById("changelog").classList.remove("hide")
                    document.getElementById("changelog-title").textContent = "Update Complete! | " + newest_version.split("\n")[0]
                    document.getElementById("changelog-text").textContent = newest_version.split("\n").slice(1).join("\n")
                    document.getElementById("changelog-ignore").classList.add("hide")
                    document.getElementById("changelog-update").textContent = Translation.of("ignore")
                    document.getElementById("changelog-ignore").style.right = "calc(2rem + " + document.getElementById("changelog-update").getBoundingClientRect().width + "px)"
                    await new Promise(resolve => {
                        document.getElementById("changelog-update").addEventListener("mouseup", async () => {
                            resolve(true)
                        })
                        document.getElementById("changelog-ignore").addEventListener("mouseup", async () => {
                            resolve(false)
                        })
                    });

                    document.getElementById("changelog").classList.add("hide")
                }
            }

            await globLog("Language (" + (Date.now() - start) + "ms).")

            if (Translation.getLanguage() === "") {
                document.getElementById("language-list").classList.remove("language-list-hide")
                document.getElementById("language-list").classList.add("language-list-force")
                document.getElementById("loader").appendChild(document.getElementById("language-list"))
                let interval;
                await new Promise(resolve => interval = setInterval(() => {
                    if (Translation.getLanguage() !== "") {
                        resolve()
                        clearInterval(interval)
                    }
                }, 100))

                document.getElementById("main").appendChild(document.getElementById("language-list"))
                document.getElementById("language-list").classList.add("language-list-hide")
                document.getElementById("language-list").classList.remove("language-list-force")
            } else {
                loadTranslation(Translation.getLanguage(), true)
            }

            await globLog("DDLC Check (" + (Date.now() - start) + "ms).")

            if (!await isDir("./store/ddlc")) {
                document.getElementById("loadingsub").textContent = Translation.of("select_zip")
                document.getElementById("select-zip").classList.remove("hide")
                let listener = async () => {
                    await openUrl("https://ddlc.moe")
                };
                document.getElementById("loadingsub").addEventListener("mouseup", listener)

                while (!await isDir("./store/ddlc")) {
                    await new Promise(resolve => setTimeout(resolve, 100))
                }

                document.getElementById("loadingsub").removeEventListener("mouseup", listener)
            }

            document.getElementById("select-zip").remove();

            await globLog("Theme (" + (Date.now() - start) + "ms).")

            await setTheme(localConfig.config.theme, true)
            await globLog("Covers (" + (Date.now() - start) + "ms).")
            await update_cover_images(true)
            await globLog("Main (" + (Date.now() - start) + "ms).")
            await home_main()
            await globLog("Watcher (" + (Date.now() - start) + "ms).")
            await watch(
                event.payload.path,
                async (event) => {
                    for (const index in event.paths) {
                        const path = event.paths[index];
                        setTimeout(async () => {
                            if ((path.endsWith(".zip") || path.endsWith(".rar") || path.endsWith(".rpa")) && await isExist(path)) {
                                part_file_size = 0
                                part_file = null

                                document.getElementById("install-info").classList.add("hide")
                                document.getElementById("alert").classList.remove("hide")

                                showContainers(false)
                                alert_path = path
                                const split = path.split(fileTerminator);
                                const data = await metadata(path);

                                document.getElementById("alert-size").innerText = Math.floor(data.size / 1048600).toString() + "mb";
                                document.getElementById("alert-pth").innerText = payloadPath;
                                document.getElementById("alert-name").textContent = split[split.length - 1].split(".")[0];
                            } else if ((path.includes(".zip") || path.includes(".rar") || path.includes(".rpa")) && path.endsWith(".crdownload") && await isExist(path)) {
                                if (path == part_file) {
                                    let old_size = part_file_size;
                                    let dT = Date.now() - last_change;
                                    if (dT < 10) {
                                        return
                                    }
                                    last_change = Date.now()
                                    part_file = path;
                                    part_file_size = (await metadata(path)).size

                                    let mbs = (part_file_size - old_size) / (dT * 1000);
                                    document.getElementById("install-info").textContent = "Downloading " + part_file.split(fileTerminator).pop().split(".").reverse().pop() + " at " + (Math.round(mbs * 100) / 100) + "mb/s"
                                } else {
                                    part_file = path;
                                    last_change = Date.now();
                                    part_file_size = (await metadata(path)).size
                                    document.getElementById("install-info").textContent = "Downloading " + part_file.split(fileTerminator).pop().split(".").reverse().pop()
                                    document.getElementById("install-info").classList.remove("hide")
                                }
                            }
                        }, 1000)
                    }
                }, {
                    delayMs: 500
                }
            )

            await globLog("Finished Loading Core (" + (Date.now() - start) + "ms).")
        }
        try {
            await requestDirectory(event.payload.final_data)
            await home_main()
        } catch (e) {
        }

    })

    listen('closed', async (event) => {
        if (event.payload.id !== "") {

            await getLauncher(event.payload.id).functions().close();
        }
    });

    listen('popup', async (event) => {
        await confirm(event.payload.text)
    });

    listen('substring', async (event) => {
        if (event.payload.text.startsWith("Extracting")) {
            document.getElementById("loadingsub").textContent = event.payload.text.replace("Extracting", Translation.of("extracting"))
        } else {
            document.getElementById("loadingsub").textContent = event.payload.text
        }
    });

    document.getElementById("update").addEventListener("mouseup", async () => {
        play(sound_beep)
        launch_desktop()
    })

    document.getElementById("play").addEventListener("mouseup", async () => {
        if (currentEntry !== "" && document.getElementById("delete-prompt").classList.contains("hide")) {
            await getLauncher(currentEntry).functions().open();
        }
    })

    document.getElementById("version").addEventListener("mouseup", async _ => {
        // await invoke("update", {
        //     close: false
        // })
        launch_desktop()
    })

    document.getElementById("cover-last").addEventListener("mouseenter", () => {
        mouse_cover_available = true
    })
    document.getElementById("cover-last").addEventListener("mouseleave", () => {
        mouse_cover_available = false
    })

    document.getElementById("image-picker-cancel").addEventListener("mouseup", async () => {
        await play(sound_boop)
        document.getElementById("profile-blur").classList.add("hide")
        document.getElementById("image-picker-bg").classList.remove("image-picker-visible");
    })

    document.getElementById("cove").addEventListener("mouseup", async () => {
        if (currentEntry !== "" && !mouse_cover_available) {
            await getLauncher(currentEntry).functions().onFavorite()
        }
    })

    document.getElementById("delete").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            let confirmed = await confirm("Are you sure you want to delete '" + getLauncher(currentEntry).functions().location + "' and its data?")
            if (confirmed) {
                showContainers(false)
                await invoke("delete_path", {
                    path: getLauncher(currentEntry).functions().location
                });
                getLauncher(currentEntry).functions().item.remove();
                delete getLauncher(currentEntry).functions();
                showContainers(true)
                await home_main()

            }
        }
    })

    document.getElementById("path").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            await getLauncher(currentEntry).functions().path();
        }
    })

    document.getElementById("pill-files").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            await getLauncher(currentEntry).functions().path();
        }
    })

    document.getElementById("reset-save").addEventListener("mouseup", async () => {

        if (currentEntry !== "") {
            let final = getLauncher(currentEntry).functions().absolute_location;
            let path = final + fileTerminator + terminatePath(terminatePath("game\\scripts.rpa"));
            if (!await isExist(path)) {
                path = final + fileTerminator + terminatePath(terminatePath("game\\options.rpyc"));
                if (!await isExist(path)) {
                    globWarn("No save found!")
                    confirm("No save found!")
                    return;
                }
            }
            let loc = await invoke("rpa_data", {
                path: path,
                out: final
            })
            if (loc !== "") {
                document.getElementById("delete-prompt").classList.remove("hide")
                document.getElementById("delete-context").textContent = "Are you sure you want to delete\n" + loc + "?"
                save_path = loc;
            } else {
                confirm("Unknown Save Data Location!")
            }

        }

    })
    document.getElementById("delete-save").addEventListener("mouseup", async () => {

        if (currentEntry !== "") {
            document.getElementById("profile-blur").classList.remove("hide")

            let final = getLauncher(currentEntry).functions().absolute_location;
            let path = final + fileTerminator + terminatePath("game\\scripts.rpa");
            if (!await isExist(path)) {
                path = final + fileTerminator + terminatePath("game\\options.rpyc");
                if (!await isExist(path)) {
                    globWarn("No save found!")
                    confirm("No save found!")
                    return;
                }
            }
            let loc = await invoke("rpa_data", {
                path: path,
                out: final
            })
            if (loc !== "") {
                document.getElementById("profile-blur").classList.remove("hide")

                update_profiles(loc)
            } else {
                document.getElementById("profile-blur").classList.add("hide")

                confirm("Unknown Save Data Location!")
            }

        }

    })

    document.getElementById("extract").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            let final = getLauncher(currentEntry).functions().absolute_location + fileTerminator + terminatePath("game\\scripts.rpa");
            console.log(final)
            document.getElementById("loadingsub").textContent = "Extracting (This will take 20-40s)"
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            if (await isExist(final)) {
                await invoke("extract_game_script", {
                    path: final,
                    out: getLauncher(currentEntry).functions().absolute_location + fileTerminator + "deobf"
                })
                await invoke("open_path", {
                    path: getLauncher(currentEntry).functions().absolute_location + fileTerminator + "deobf"
                })
            } else {
                confirm("No game script found!")

            }


            await getLauncher(currentEntry).functions().leftClick()
            document.getElementById("loader").classList.add("hide")
            document.getElementById("main").classList.remove("hide")
        }
    })

    document.getElementById("delete-yes").addEventListener("mouseup", async () => {
        document.getElementById("delete-prompt").classList.add("hide")
        if (save_path === "") return;
        await invoke("delete_path", {
            path: save_path
        });
    })

    document.getElementById("delete-no").addEventListener("mouseup", async () => {
        save_path = "";
        document.getElementById("delete-prompt").classList.add("hide")
    })

    document.getElementById("modtitle").addEventListener("focusin", async () => {
        if (currentEntry === "") {
            document.getElementById("modtitle").value = user_name
        }
    })

    document.getElementById("modtitle").addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            document.getElementById("modtitle").blur()
            document.getElementById("modtitle").scroll(100)
        }
    })

    document.getElementById("modtitle").addEventListener("blur", async () => {
        document.getElementById("modtitle").scrollLeft = 0;
        if (currentEntry !== "") {
            await rename_mod()
        } else {
            const name = document.getElementById("modtitle").value;
            if (name.includes(Translation.of("greet")) || name === "") {
                await home_main()
                return;
            }
            user_name = name
            await invoke("tracker", {
                event: 'set_user_name',
                props: {
                    name: user_name
                }
            })
            await saveConfig()
            await home_main()
        }
    })

    document.getElementById("options").addEventListener("mouseup", async () => {
        play(sound_beep)

        await home_main()
    })
    document.getElementById("report-open").addEventListener("mouseup", async () => {
        document.getElementById("profile-blur").classList.remove("hide")
        document.getElementById("report-bg").classList.remove("hide")
        document.getElementById("report-textc").focus()
    })
    document.getElementById("report-close").addEventListener("mouseup", async () => {
        document.getElementById("profile-blur").classList.add("hide")
        document.getElementById("report-bg").classList.add("hide")
    })
    document.getElementById("report-send").addEventListener("mouseup", async () => {
        if (document.getElementById("report-textc").value !== "") {
            await invoke("tracker", {
                event: 'issue',
                props: {issue: document.getElementById("report-textc").value}
            })
            console.log(document.getElementById("report-textc").value)
        }
        document.getElementById("report-textc").value = ""
        document.getElementById("profile-blur").classList.add("hide")
        document.getElementById("report-bg").classList.add("hide")
    })
    document.getElementById("cover-last").addEventListener("mouseup", async (e) => {
        play(sound_beep)
        document.getElementById("image-picker-cancel").textContent = Translation.of("cancel");
        document.getElementById("profile-blur").classList.remove("hide")
        document.getElementById("image-picker-bg").classList.add("image-picker-visible")
    })

    document.getElementById("close").addEventListener("mouseup", async () => {
        exit_program()
    })

    document.getElementById("view-background").addEventListener("mouseup", async () => {
        document.getElementById("view-image").classList.remove("zoom")
        document.getElementById("view-background").classList.add("hide")
    })

    document.getElementById("min").addEventListener("mouseup", async () => {
        play(sound_beep)
        await invoke("minimize");
    })

    document.getElementById("source").addEventListener("mouseup", async () => {
        play(sound_beep)
        await requestDirectory();
    })

    document.getElementById("search").addEventListener("input", async (event) => {

        if (event.target.value === "") {
            for (const index in getLaunchers()) {
                const element = getLauncher(index).functions();
                element.item.classList.add("hide2");
                element.item.style.removeProperty("order")
            }
            setTimeout(() => {
                for (const index in getLaunchers()) {
                    const element = getLauncher(index).functions();
                    element.item.classList.remove("hide2");
                }
            }, 0)
            lastInputLength = 0;
            return;
        }
        let lowerTarget = event.target.value.toLowerCase();
        const length = lowerTarget.length;
        const ignoreInvis = length > lastInputLength;
        for (const index in getLaunchers()) {
            const element = getLauncher(index).functions();

            if (ignoreInvis && element.item.classList.contains("hide2")) {
                continue;
            }

            const lowerName = element.nameId;
            let isValid = true;
            let split = lowerName.split(" ");
            let trunc = lowerName;
            let markers = 0;
            for (const letter in lowerTarget) {
                if (letter < split.length) {
                    if (split[letter].startsWith(lowerTarget[letter])) {
                        markers++;
                    }
                }
                if (trunc.indexOf(lowerTarget[letter]) === -1) {
                    isValid = false;
                    break;
                }
                trunc = trunc.replace(lowerTarget[letter], "");
            }

            if (isValid) {
                let index = 10 - (markers * 2)
                if (element.isFavorite) {
                    index--;
                }
                if (element.isPinned) {
                    index--;
                }
                if (lowerName.includes(lowerTarget)) {
                    index -= lowerTarget.length;
                }
                element.item.style.order = index.toString();
                element.item.classList.remove("hide2");
            } else {
                element.item.classList.add("hide2");
            }
        }
        lastInputLength = length;
    })

    document.getElementById("english").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("en", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("russian").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("ru", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("pt").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("pt", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("spanish").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("es", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("japan").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("jp", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("french").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("fr", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("cantonese").addEventListener("mouseup", async () => {
        let old = Translation.getLanguage();
        loadTranslation("zh-HK", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("language").addEventListener("mouseup", async () => {
        document.getElementById("language-list").classList.toggle("language-list-hide")
    })

    document.getElementById("tutorial-no").addEventListener("mouseup", async () => {
        if (tutorial_pointer != null) {
            tutorial_pointer.remove()
            tutorial_pointer = null;
        }
        tutorial_complete = true
        document.getElementById("warn").remove()
        await saveConfig()
    })

    document.getElementById("tutorial").addEventListener("mouseup", async () => {
        document.getElementById("warn").classList.add("tutorial-active")
        document.getElementById("tutorial").textContent = Translation.of("next")
        document.getElementById("tutorial-no").textContent = Translation.of("cancel")
        if (tutorial_step >= 4 && currentEntry === "") {
            if (tutorial_pointer == null) {
                tutorial_pointer = document.createElement("div")
                tutorial_pointer.classList.add("tutorial-pointer")
                document.getElementById("main").appendChild(tutorial_pointer)
            }
            tutorial_pointer.style.width = document.getElementById("modlist").getBoundingClientRect().width + "px";
            tutorial_pointer.style.height = document.getElementById("modlist").getBoundingClientRect().height + "px";
            tutorial_pointer.style.borderRadius = "10px"
            tutorial_pointer.style.top = (document.getElementById("modlist").getBoundingClientRect().y + (document.getElementById("modlist").getBoundingClientRect().height / 2)) + "px"
            tutorial_pointer.style.left = (document.getElementById("modlist").getBoundingClientRect().x + (document.getElementById("modlist").getBoundingClientRect().width / 2)) + "px"
            document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(4).of("title");
            document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(4).of("context");
            confirm(Translation.sub("tutorial").of("select"))
            return
        }
        tutorial_step++;
        switch (tutorial_step) {
            case 1:
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(1).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(1).of("context");
                break;
            case 2:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    tutorial_pointer.style.top = (document.getElementById("themeselect").getBoundingClientRect().y + (document.getElementById("themeselect").getBoundingClientRect().height / 2)) + "px"
                    tutorial_pointer.style.left = (document.getElementById("themeselect").getBoundingClientRect().x + (document.getElementById("themeselect").getBoundingClientRect().width / 2)) + "px"

                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(2).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(2).of("context");
                break;
            case 3:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("covers").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("covers").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("covers").getBoundingClientRect().y + (document.getElementById("covers").getBoundingClientRect().height / 2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("covers").getBoundingClientRect().x + (document.getElementById("covers").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(3).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(3).of("context");
                break;
            case 4:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("reddit").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("reddit").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("reddit").getBoundingClientRect().y + (document.getElementById("reddit").getBoundingClientRect().height / 2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("reddit").getBoundingClientRect().x + (document.getElementById("reddit").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(4).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(4).of("context");
                break;
            case 5:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("cove").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("cove").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("cove").getBoundingClientRect().y + (document.getElementById("cove").getBoundingClientRect().height / 2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("cove").getBoundingClientRect().x + (document.getElementById("cove").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(5).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(5).of("context");
                break;
            case 6:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("modtitle").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("modtitle").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("modtitle").getBoundingClientRect().y + (document.getElementById("modtitle").getBoundingClientRect().height / 2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("modtitle").getBoundingClientRect().x + (document.getElementById("modtitle").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(6).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(6).of("context");
                break;
            case 7:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("modinfo").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("modinfo").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("modinfo").getBoundingClientRect().y + (document.getElementById("modinfo").getBoundingClientRect().height / 2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("modinfo").getBoundingClientRect().x + (document.getElementById("modinfo").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(7).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(7).of("context");
                break;
            default:
                if (tutorial_pointer != null) {
                    tutorial_pointer.remove()
                    tutorial_pointer = null;
                }
                document.getElementById("tutorial").remove()
                document.getElementById("tutorial-no").style.width = "85%"
                document.getElementById("tutorial-no").textContent = Translation.of("end")
                document.getElementById("tutorial-title").textContent = Translation.sub("tutorial").sub(8).of("title");
                document.getElementById("tutorial-context").textContent = Translation.sub("tutorial").sub(8).of("context");
                break;
        }
    })


    // Prevent Find

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
        }
    });

    document.getElementById("themeselect").addEventListener("mouseup", async (e) => {
        let next = CLIENT_THEME_ENUM.indexOf(localConfig.config.theme) + (e.button === 0 ? 1 : -1);
        if (next > CLIENT_THEME_ENUM.length - 1) {
            next = 0;
        }
        if (next < 0) {
            next = CLIENT_THEME_ENUM.length - 1;
        }
        await play(sound_beep)
        await setTheme(CLIENT_THEME_ENUM[next], false);
    })

    document.getElementById("importimage").addEventListener("mouseup", async () => {
        await invoke("open_path", {
            path: local_path + fileTerminator + terminatePath("store\\images")
        })
    })


    document.getElementById("import").addEventListener("mouseup", async () => {
        play(sound_beep)
        await import_mod();
    })

    await globLog("Finished Loading Observers2 (" + (Date.now() - start) + "ms).")

    // SNOWFLAKE

    await globLog("Loading Intervals.")

    // setInterval(snowflake, 100)
    setInterval(update_concurrent_game, 1000)
    setInterval(keepAlive, 300_000)

    // getCurrentWindow().onFocusChanged(({
    //     payload: isfocused
    // }) => {
    //     focused = isfocused
    //     if (focused) {
    //         jingle_audio.play()
    //     } else {
    //         jingle_audio.pause()
    //     }
    // });

    // jingle_audio.volume = 0.1;
    // jingle_audio.loop = true;
    // jingle_audio.play()

    // Setup SVG
    let dragging = false;
    let dragStart = 0;
    document.getElementById("pin-holder").addEventListener("mousedown", async () => {
        if (getLauncher(currentEntry)) {
            dragging = true;
            dragStart = Date.now();
        }
    })
    document.getElementById("pin-holder").addEventListener("mousemove", async (x) => {
        if (currentEntry !== "" && dragging) {
            const absx = document.getElementById("container").getBoundingClientRect().x;
            const absy = document.getElementById("container").getBoundingClientRect().y;
            document.getElementById("pin-holder").style.left = x.clientX - absx + "px";
            document.getElementById("pin-holder").style.top = x.clientY - absy + "px";
            document.getElementById("pin-holder").classList.add("pin-holder-drag")
            document.getElementById("pin-pinned").classList.add("hide")
            document.getElementById("pin-unpinned").classList.add("pin-unpinned-heart")
            document.getElementById("pin-unpinned").classList.remove("hide")
        }
    })
    document.getElementById("pin-holder").addEventListener("mouseup", async (mouse) => {
        dragging = false;
        document.getElementById("pin-holder").classList.remove("pin-holder-drag")

        if (getLauncher(currentEntry)) {
            if (Date.now() - dragStart < 100) {
                document.getElementById("pin-holder").style.removeProperty("left")
                document.getElementById("pin-holder").style.removeProperty("top")
                getLauncher(currentEntry).functions().setPinned()
            } else {
                const minX = document.getElementById("cove").getBoundingClientRect().x;
                const minY = document.getElementById("cove").getBoundingClientRect().y;
                const maxX = minX + document.getElementById("cove").getBoundingClientRect().width;
                const maxY = minY + document.getElementById("cove").getBoundingClientRect().height;

                if (mouse.clientX >= minX && mouse.clientX <= maxX && mouse.clientY >= minY && mouse.clientY <= maxY) {
                    getLauncher(currentEntry).functions().setPinned(true)
                } else {
                    document.getElementById("pin-holder").style.removeProperty("left")
                    document.getElementById("pin-holder").style.removeProperty("top")
                    getLauncher(currentEntry).functions().setPinned(false)
                }
            }
        }
    })

    await globLog("Finished Loading PT. 1 (" + (Date.now() - start) + "ms).")
    await invoke("request_path")

    let loop = setInterval(async () => {
        if (!reset) {
            await invoke("request_path")
        } else {
            await globLog("pt. 2 started")
            clearInterval(loop)
        }
    }, 2000)
}

async function updateClient() {
    if (await shouldUpdate()) {
        await invoke('tracker', {
            event: 'update_launcher',
            props: {from: CLIENT_VERSION}
        });
        document.getElementById("loadingsub").textContent = Translation.of("updating") + " Doki Doki Mod Manager"
        await invoke("update_exe")
    } else {
        console.warn("Already Up To Date (" + CLIENT_VERSION + ")")
    }
}

async function launch_desktop() {
    previous_app = createApp(Desktop)
    previous_app.mount("#app");

    for (const log in logs) {
        const data = logs[log];
        const holder = document.createElement("div");
        const text = document.createElement("header");
        const timestamp = document.createElement("header");
        const difference = data.timestamp - start;

        holder.classList.add("console-text-holder")
        text.classList.add("console-text")
        timestamp.classList.add("console-text-right")

        if (data.isWarn) {
            holder.classList.add("console-warn")
        }

        text.innerHTML = htmlEscape(data.msg).replaceAll("\n", "<br>")
        timestamp.textContent = (difference < 1000 ? difference + "ms" : (difference > 60000 ? (difference / 60000).toFixed(2) + "m" : (difference / 1000).toFixed(2) + "s"));

        holder.appendChild(text);
        holder.appendChild(timestamp);

        document.getElementById("console").appendChild(holder);
    }

    document.getElementById("console").scrollTo(0, document.getElementById("console").scrollHeight)

    document.getElementById("desktop-version").textContent = "Doki Doki Mod Manager " + CLIENT_VERSION
    document.getElementById("desktop-launch").addEventListener("mouseup", () => {
        window.location.reload(true)
    })

    document.getElementById("desktop-close2").addEventListener("mouseup", () => {
        invoke("close");
    })

    document.getElementById("desktop-close").addEventListener("mouseup", () => {
        invoke("close");
    })


    document.getElementById("desktop-update").addEventListener("mouseup", () => {
        if (shouldUpdate()) {
            previous_app.unmount()
            createApp(App).mount("#app")
            updateClient()
        }

    })
}

createApp(App).mount("#app");
document.addEventListener('DOMContentLoaded', onLoad);
