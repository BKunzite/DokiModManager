import { createApp } from "vue";
import { readDir, readTextFile, create, writeTextFile, writeFile, watch, remove, rename, readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { metadata, isExist, isDir } from "tauri-plugin-fs-pro-api";
import { homeDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import sound_beep from './assets/select.ogg'
import sound_boop from './assets/hover.ogg'
import sound_click from './assets/pageflip.ogg'
import { Base64 } from 'js-base64';
import App from "./App.vue";

let launchers = []
let currentEntry = ""
let covers = []
let background_cover = 0
let total_time = 0;
let warn_path = true;
let mouse_cover_available = false;
let alert_path=undefined
let selectedPath;
let local_path;
let observer;
let reset = false;
let localConfig = {
    path: "",
    config: {}
}

const CLIENT_VERSION = "1.0.0-release"
const VERSION_URL = "https://raw.githubusercontent.com/AKunzite/DokiModManager/refs/heads/main/current_ver.txt"
const CLIENT_THEME_ENUM = [
    "NATSUKI", "MONIKA", "YURI", "SAYORI"
]
const CLIENT_THEMES = {
    NATSUKI: {
        primary_color: [254, 179, 188],
        primary_color_saturated: [229, 127, 166],
        image: "chibi_natsuki.png"
    },
    MONIKA: {
        primary_color: [128, 239, 128],
        primary_color_saturated: [118, 138, 118],
        image: "chibi_monika.png"
    },
    YURI: {
        primary_color: [108, 69, 130],
        primary_color_saturated: [52, 24, 55],
        image: "chibi_yuri.png"

    },
    SAYORI: {
        primary_color: [227, 138, 131],
        primary_color_saturated: [192, 100, 107],
        image: "chibi_sayori.webp"

    }
}
const heart_empty = "&#62920;";
const heart_full = "&#62919;";

// Removes Right Click Menu

document.oncontextmenu = document.body.oncontextmenu = function() {return false;}

// Updates the list of covers
async function sync_covers() {
    covers = [
        "house.webp",
        "wallpapers.png",
        "natsuki.jpg",
        "yuri.jpg",
        "sayori.jpg",
        "monika.png"
    ]
    if (await isDir(local_path + "\\store\\images")) {
        for (const image of await readDir(local_path + "\\store\\images")) {
            if (image.name.endsWith(".png") || image.name.endsWith(".jpg") || image.name.endsWith(".jpeg") || image.name.endsWith(".webp")) {
                covers.push(local_path + "\\store\\images" + "\\" + image.name);
            }
        }
    }
}

// Gets The Current Client Version From Github

async function getVersion() {
    try {
        const response = await fetch(VERSION_URL)

        if (!response.ok) {
            console.warn(`Client Version Check Failed! Returned Status ${response.status}`)
            return CLIENT_VERSION;
        }

        const version = await response.text();
        return version.trim()
    } catch (error) {
        console.warn(`Client Version Check Failed! Error with: ${error}`)
    }
    return CLIENT_VERSION;
}

// Loads local config which includes background cover id
// and the total amount of time you have played mods
//
// Also includes whether it has warned you to
// save downloads to the users download folder

async function loadConfig(path) {
    let hasConfig = false;
    let configPath = path + "\\client-config.json";
    let theme = "NATSUKI"
    const localFiles = await readDir(path);
    let configData = {
        coverId: 0,
        totalTime: 0,
        warn_path: true,
        theme: "NATSUKI"
    }

    local_path = path;

    // Detects Config

    for(const localEntry of localFiles) {
        if (localEntry.name === "client-config.json") {
            hasConfig = true;
            break;
        }
    }

    if (!hasConfig) {
        if (selectedPath !== "" && selectedPath !== undefined) {
            for (const entry of await readDir(selectedPath)) {
                if (entry.isDirectory) {
                    const localFiles2 = await readDir(selectedPath + "\\" + entry.name);
                    let hasConfig2 = false;
                    let configPath2 = selectedPath + "\\" + entry.name + "\\.ddmm.config.json";
                    for(const localEntry of localFiles2) {
                        if (localEntry.name === ".ddmm.config.json") {
                            hasConfig2 = true;
                            break;
                        }
                    }
                    if (hasConfig2) {
                        let kconfigData = {
                            author: "unknown",
                            time: 0,
                            size:0,
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
        const contents = JSON.stringify(configData);
        await writeTextFile(configPath, contents);
    } else {
        configData = JSON.parse(await readTextFile(configPath));
    }

    configData.warn_path = configData.warn_path || false;
    configData.theme = configData.theme || "NATSUKI";
    configData.coverId = configData.coverId || 0;
    configData.totalTime = configData.totalTime || 0;

    setTheme(configData.theme)

    localConfig = {
        path: configPath,
        config: configData
    }

    warn_path = configData.warn_path;
    total_time = configData.totalTime;
    background_cover = configData.coverId;

    await update_cover_images(true)
}

// Resets and updates the list of cover images

async function update_cover_images(first_time) {
    await sync_covers()
    const images = document.getElementById("images")

    for (const cover of document.querySelectorAll(".covers-cover")) {
        cover.remove()
    }

    for (let i = covers.length - 1; i >= 0; i--) {
        const cover_bg = document.createElement("div");
        const cover_img = document.createElement("img");
        const cover_text = document.createElement("button");

        cover_img.src = await getImage(i)
        cover_img.classList.add("covers-image");

        cover_bg.classList.add("covers-cover");

        cover_text.classList.add("covers-text");
        cover_text.innerHTML = "&#60450;"

        if (i > 5) {
            cover_text.addEventListener("mouseup", () => {
                remove(covers[i]);
                covers.splice(i, 1);
                console.log(covers)
                setTimeout(async () => {
                    let scroll =  images.scrollLeft;
                    update_cover_images()
                    setCover(background_cover);
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

// Saves config to file (./client-config.json)

async function saveConfig() {
    localConfig.config.coverId = background_cover;
    localConfig.config.totalTime = total_time;
    localConfig.config.warn_path = warn_path;
    await writeTextFile(localConfig.path, JSON.stringify(localConfig.config))
}

// Plays interaction sounds

function play(song) {
    var beep = new Audio(song)
    beep.volume = 0.5;

    beep.play()
}

// Import Requested Mod Or Prompts User To Select Mod

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
    }
    if (selectedPath != null) {
        if (selectedPath.endsWith(".zip") || selectedPath.endsWith(".rar")) {
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            document.getElementById("loadingsub").textContent = "Importing Mod " + selectedPath
            await invoke("import_mod", {path: selectedPath})
        } else {
            confirm("Not A Zip File!")
        }
    }
}

// Sets Cover Images/Background Image

async function setCover(id) {
    if (id > covers.length - 1) {
        id = 0;
    }

    let image = await getImage(id)

    document.getElementById("cove").style.backgroundImage = 'url("' + image  +'")';

    if (currentEntry === "") {
        document.getElementById("bg").style.backgroundImage = 'url("' +  image +'")';
        background_cover = id;
        await saveConfig()
    }
}

// Sets Client Theme Color

async function setTheme(name) {
    if (!(name in CLIENT_THEMES)) {
        name = "NATSUKI";
    }
    document.getElementById("chibi").src = await getImage(CLIENT_THEMES[name].image);
    document.body.style.setProperty("--primary-color", CLIENT_THEMES[name].primary_color)
    document.body.style.setProperty("--primary-color-saturated", CLIENT_THEMES[name].primary_color_saturated)

    localConfig.config.theme = name
    await saveConfig()
}

// Gets An Image Locally/In Project

async function getImage(id) {
    const cover = covers[id];

    if (cover !== undefined && cover.includes(":")) {
        const contents = await readFile(cover);
        const base64String = Base64.fromUint8Array(contents);

        return `data:image/png;base64,${base64String}`
    } else {
        const images = import.meta.glob('./assets/*.{png,jpg,jpeg,svg,json,webp}', { eager: true, as: 'url' });
        if (cover !== undefined) { return images["./assets/" + cover] } else { return images["./assets/" + id] }
    }
}

// Requests DDLC Directory and Updates Mods

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
        await invoke("path_select", {path: selectedPath})
    } else {
        selectedPath = path;
    }
    if (ppath !== undefined || selectedPath !== undefined) {
        if (ppath !== undefined) {
            selectedPath = ppath;
        }
        for (const element in launchers) {
            launchers[element]["item"].remove();
        }
        document.getElementById("search").value = ""
        launchers = []
        document.getElementById("loader").classList.remove("hide")
        document.getElementById("main").classList.add("hide")
        const files = await readDir(selectedPath);
        document.getElementById("nummods").textContent = files.length;

        // Update Mods List

        for (const entry of files) {
            document.getElementById("loadingsub").textContent = "Loading Mod " + entry.name.replace("ddlc-","").replace("ddlc","").replace("-","")
            if (entry.isDirectory) {
                const localFiles = await readDir(selectedPath + "\\" + entry.name);
                let hasConfig = false;
                let configPath = selectedPath + "\\" + entry.name + "\\.ddmm.config.json";
                for(const localEntry of localFiles) {
                    if (localEntry.name === ".ddmm.config.json") {
                        hasConfig = true;
                        break;
                    }
                }
                let configData = {
                    author: "unknown",
                    time: 0,
                    size:0,
                    favorite: false,
                    coverId: 0
                }
                if (!hasConfig) {
                    create(configPath)
                    const data = await metadata(selectedPath + "\\" + entry.name);
                    const contents = JSON.stringify(configData);
                    configData.size = data.size;
                    await writeTextFile(configPath, contents);
                }else {

                    configData = JSON.parse(await readTextFile(configPath));

                }
                if (configData.coverId === undefined || configData.coverId === null) {
                    configData.coverId = 0;
                }
                let shorthand = entry.name.replace("ddlc-","").replace("ddlc","").replace("-"," ");
                const sidetext = document.createElement("header");
                const normalText = "<span style=\"font-family: Icon,serif\">&#60810;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand +"</span>";
                const faveText = "<span style=\"font-family: Icon,serif\">&#60938;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand +"</span>";

                let launch_time = Date.now();
                sidetext.classList.add("sidebutton");
                if (configData.favorite) {
                    sidetext.classList.add("favorite")
                }
                sidetext.id=shorthand;
                if (configData.favorite) {
                    sidetext.innerHTML = faveText
                } else {
                    sidetext.innerHTML = normalText
                }

                observer.observe(sidetext);
                launchers[entry.name] = {
                    item: sidetext,
                    location: selectedPath + "\\" + entry.name,
                    getData: async () => {
                        return configData
                    },
                    setAuthor: async (author) => {
                        configData.author = author;
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                    },
                    getPath: async () => {
                        return selectedPath
                    },
                    getName: async () => {
                        return entry.name
                    },
                    open: async () => {
                        showContainers(false)
                        document.getElementById("pill").classList.remove("hide")
                        setTimeout(async () => {
                            play(sound_beep)
                            launch_time = Date.now();
                            let isInDir = false;
                            let dir = selectedPath + "\\" + entry.name;
                            for (const localEntry of localFiles) {
                                if (localEntry.name === "DDLC.exe") {
                                    isInDir = true;
                                    break;
                                }
                            }
                            if (!isInDir) {
                                dir = selectedPath + "\\" + entry.name + "\\DDLC-1.1.1-pc"
                            }
                            let exes = []
                            const dirFiles = await readDir(dir);

                            let gameExe = "";

                            for (const localEntry of dirFiles) {
                                if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe")) {
                                    exes.push(localEntry.name);
                                }
                            }
                            if (exes.length > 1) {
                                for (const localEntry of exes) {
                                    if (localEntry !== "DDLC.exe") {
                                        gameExe = localEntry;
                                        break;
                                    }
                                }
                            } else if (exes.length === 1) {
                                gameExe = exes[0];
                            } else {
                                console.error("Game Exe Not Found!")
                            }

                            if (gameExe !== "") {
                                await invoke("launch", {path: dir + "\\" + gameExe, id: entry.name, renpy: await getRenpy(dir)})
                            }
                        }, 1000)


                    },
                    get_time: async () => {
                      return Date.now() - launch_time;
                    },
                    path: async () => {
                        let isInDir = false;
                        let dir = selectedPath + "\\" + entry.name;
                        for (const localEntry of localFiles) {
                            if (localEntry.name === "DDLC.exe") {
                                isInDir = true;
                                break;
                            }
                        }
                        if (!isInDir) {
                            dir = selectedPath + "\\" + entry.name + "\\DDLC-1.1.1-pc"
                        }
                        await invoke("open_path", {path: dir})
                    },
                    nextCover: async () => {
                        configData.coverId++;
                        if (configData.coverId > covers.length - 1) {
                            configData.coverId = 0;
                        }
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                        await setCover(configData.coverId);
                    },
                    lastCover: async () => {
                        configData.coverId--;
                        if (configData.coverId < 0) {
                            configData.coverId = covers.length - 1;
                        }
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                        await setCover(configData.coverId);
                    },
                    oncove: async () => {
                        configData.favorite = !configData.favorite;
                        sidetext.classList.toggle("favorite", configData.favorite)
                        if (configData.favorite) {
                            sidetext.innerHTML = faveText
                        } else {
                            sidetext.innerHTML = normalText
                        }
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                        document.getElementById("covertext").innerHTML = configData.favorite ? heart_full : heart_empty;
                    },
                    close: async () => {
                        if (alert_path === undefined) {
                            showContainers(true)
                        }
                        play(sound_click)
                        const playTime =  Date.now() - launch_time;
                        total_time += playTime;
                        configData.time += playTime;
                        const data = await metadata(selectedPath + "\\" + entry.name);
                        const contents = JSON.stringify(configData);
                        configData.size = data.size;
                        document.getElementById("pill").classList.add("hide")
                        await writeTextFile(configPath, contents);
                        await saveConfig()
                        await launchers[entry.name].leftClick();
                    },
                    leftClick: async () => {
                        currentEntry = entry.name;
                        let isInDir = false;
                        let dir = selectedPath + "\\" + entry.name;
                        const fdirFiles = await readDir(dir);

                        await setCover(configData.coverId);

                        for (const localEntry of localFiles) {
                            if (localEntry.name === "DDLC.exe") {
                                isInDir = true;
                                break;
                            }
                        }
                        if (!isInDir) {
                            dir = selectedPath + "\\" + entry.name + "\\DDLC-1.1.1-pc"
                        }

                        let customExe;
                        let about ;
                        let renpy = await getRenpy(dir);

                        for (const localEntry of fdirFiles) {
                            if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe") && localEntry.name !== "DDLC.exe" && customExe === undefined) {
                                customExe = localEntry.name;
                            }
                            if (localEntry.name.toLowerCase().includes("credit") && about === undefined) {
                                about = (await readTextFile(dir + "\\" + localEntry.name)).replaceAll("\n", "<br>");
                            }
                        }

                        if (renpy === undefined) {
                            renpy = "Unknown (Please create a git issue on this)";
                        }

                        if (configData.size === 0) {
                            const data = await metadata(selectedPath + "\\" + entry.name);
                            configData.size = data.size;
                        }
                        renpy = "Renpy: " + renpy + "<br>Custom Exe: " + (customExe !== undefined ? "Yes | " + customExe : "No") + "<br><br>Credits: <br>" + (about !== undefined ? about : "None Found!");
                        document.getElementById("covertext").innerHTML = configData.favorite ? heart_full : heart_empty;
                        play(sound_boop)
                        const min = Math.floor(configData.time/60000);
                        updateDisplayinfo(entry.name, configData.author, Math.floor(configData.size/1048600) + " MB",  Math.floor(min/60)+ "h " + Math.floor(min % 60) + "m", renpy)
                    }
                }
                sidetext.addEventListener("mouseup", async (event) => {
                    await launchers[entry.name].leftClick();
                })

                document.getElementById("modlist").appendChild(sidetext)
            }
        }
        document.getElementById("loadingsub").textContent = "Loaded Mods | Loading GUI"

        setTimeout(() => {
            play(sound_click)
            document.getElementById("loader").classList.add("hide")
            document.getElementById("main").classList.remove("hide")
        }, 1000)
    }

}

// Gets RenPy Version

async function getRenpy(dir) {
    let renpy;
    const dirFiles = await readDir(dir + "\\renpy");
    for (const localEntry of dirFiles) {
        if (localEntry.name === "__init__.py") {
            const code = await readTextFile(dir + "\\renpy\\" + localEntry.name);
            const lines = code.split("\n");
            for (const line of lines) {
                if (line.startsWith("version_tuple = ") && !line.includes("*")) {
                    renpy = (line + "").replace("version_tuple = (","").replace(", vc_version)", "").replaceAll(", ",".");
                    break;
                } else if (line.trim().startsWith("version_tuple = ") && line.trim().includes("(8") && !line.includes("*")) {
                    renpy = (line.trim() + "").replace("version_tuple = ","").replace("VersionTuple","").replace("(","").replace(", vc_version)", "").replaceAll(", ",".");
                    break;
                }
            }
        }
        if (localEntry.name === "vc_version.py" && renpy === undefined) {
            const code = await readTextFile(dir + "\\renpy\\" + localEntry.name);
            const lines = code.split("\n");
            for (const line of lines) {
                if (line.startsWith("version = ")) {
                    renpy = (line + "").replace("version = ","").replaceAll ("'", "").replace("u","");
                    break;
                }
            }
        }

    }
    return renpy
}

// Hide/Show Container

function showContainers(show) {
    if (show) {
        document.getElementById("modlist").classList.remove("hide")
        document.getElementById("container-boarder").classList.remove("hide")
        document.getElementById("container-shadow").classList.remove("hide")
        document.getElementById("search").classList.remove("hide")
        document.getElementById("container").classList.remove("hide")

    } else {
        document.getElementById("modlist").classList.add("hide")
        document.getElementById("container-boarder").classList.add("hide")
        document.getElementById("container-shadow").classList.add("hide")
        document.getElementById("search").classList.add("hide")
        document.getElementById("container").classList.add("hide")
    }
}

// Warns user on where to save downloads

async function warn_path_alert() {
    if (warn_path) {
        let a = await confirm("Remember To Save To " + local_path + "\\Downloads!")
        if (!a) return false;
        warn_path = false;
        await saveConfig();
        return true
    }
    return true;
}

// Updates Information On Main Window

async function updateDisplayinfo(mod, author, space, time, renpy) {
    const shorthand = mod.replace("ddlc-","").replace("ddlc","").replace("-"," ");

    document.getElementById("modtitle").textContent = shorthand

    document.getElementById("modtitle").classList.remove("hide");
    document.getElementById("modinfo").classList.remove("hide");
    document.getElementById("cove").classList.remove("hide");
    document.getElementById("update-log").classList.add("hide");

    if (author.length > 0) {
        currentEntry = mod;
        document.getElementById("covers").classList.add("hide");
        document.getElementById("rename-header").classList.remove("hide");
        document.getElementById("rename").classList.remove("hide");
        document.getElementById("rename").value = mod;
        document.getElementById("rename").placeholder = mod;
        document.getElementById("setauthor").value = author;
        document.getElementById("setauthor").placeholder = author;
        document.getElementById("setinfo-header").classList.remove("hide");
        document.getElementById("info").classList.remove("hide");
        if (renpy !== undefined) {
            document.getElementById("info").innerHTML = renpy;
        } else {
            document.getElementById("info").textContent = "No Information Found!";
        }
        document.getElementById("setauthor").classList.remove("hide");
        document.getElementById("setauthor-header").classList.remove("hide");
        document.getElementById("delete").classList.remove("hide");
        document.getElementById("path").classList.remove("hide");
        document.getElementById("play").classList.remove("hide");
        document.getElementById("optionsmenu").classList.add("hide");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon;\">&#60899;</span> " + author + " <span style=\"font-family: Icon; padding-left: 20px;\">&#60766;</span> " + space + " <span style=\"font-family: Icon; padding-left: 20px;\">&#61973;</span> " + time;
    } else {
        currentEntry = ""
        await setCover(background_cover)
        let min = Math.floor(total_time/60000);
        document.getElementById("covers").classList.remove("hide");
        document.getElementById("setinfo-header").classList.add("hide");
        document.getElementById("info").classList.add("hide");
        document.getElementById("setauthor").classList.add("hide");
        document.getElementById("setauthor-header").classList.add("hide");
        document.getElementById("rename-header").classList.add("hide");
        document.getElementById("rename").classList.add("hide");
        document.getElementById("delete").classList.add("hide");
        document.getElementById("path").classList.add("hide");
        document.getElementById("play").classList.add("hide");
        document.getElementById("optionsmenu").classList.remove("hide");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon;\">&#60899;</span> Kunzite <span style=\"font-family: Icon; padding-left: 20px;\">&#61973;</span> " + Math.floor(min / 60) + "h " + (min % 60) + "m";
    }
}

// Sets Home Screen To Main

async function home_main() {
    // await updateDisplayinfo("Hi " + (await invoke("whois", {})) + "!", "", "", "") -- This could leak the users full name; deprecated
    document.getElementById("covertext").innerHTML = ""
    await updateDisplayinfo("Hi " + (await homeDir()).replace("C:\\Users\\","") + "!", "", "", "")
}

// Sets Author Of Mod And Saves To File

async function setauthor() {
    if (currentEntry === "") return;
    document.getElementById("setauthor").blur()
    var value = document.getElementById("setauthor").value;
    if (value === "") {
        const author = (await launchers[currentEntry].getData()).author;
        document.getElementById("setauthor").value = author;
        document.getElementById("setauthor").placeholder = author;
    } else {
        await launchers[currentEntry].setAuthor(value);
        await launchers[currentEntry].leftClick();
    }
}

// Updates Screen With Game Open

async function update_concurrent_game() {
    if (!document.getElementById("modlist").classList.contains("hide") || alert_path !== undefined) {
        if (!document.getElementById("pill").classList.contains("hide")) {
            document.getElementById("pill").classList.add("hide")
        }
        return
    }

    if (document.getElementById("pill").classList.contains("hide")) {
        document.getElementById("pill").classList.remove("hide")
    }

    const playTime =  await launchers[currentEntry].get_time();
    const second = Math.floor(playTime/1000) % 60;
    const min = Math.floor(playTime/60000);
    const name = await launchers[currentEntry].getName() + " ";
    const author = (await launchers[currentEntry].getData()).author;
    const time = Math.floor(min/60) + "h " + (min % 60) + "m " + second + "s";

    document.getElementById("pill-game").textContent = name
    document.getElementById("pill-author").textContent = author
    document.getElementById("pill-time").textContent = time
}

// Renames Mod

async function rename_mod() {
    if (currentEntry === "") return;
    var value = document.getElementById("rename").value;
    var name = await launchers[currentEntry].getName();
    document.getElementById("rename").value = name;

    if (value !== name && value.length !== 0) {

        var oldName = (await launchers[currentEntry].getPath()) + "\\" + name;
        var newName = (await launchers[currentEntry].getPath()) + "\\" + value;

        try {
            if (/\\/.test(value) || value.includes("/")) {
                throw Error("Invalid Name!")
            }
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            document.getElementById("loadingsub").textContent = "Renaming Mod"
            await invoke("rename_dir", {path: oldName, newName: newName, id: value})
        } catch (e) {
            if (e == "Error: Invalid Name!") {
                confirm("The Name '" + value + "' is invalid!")
            } else {
                confirm("Cannot Rename The File Due To:\n\n" + e)
            }
        }

    }
}

// Waits For Webpage To Load

function onLoad() {

    // Listens For Rename Finishing

    listen("rename_done", async (event) => {
        await requestDirectory(selectedPath)
        while (document.getElementById("loader").classList.contains("hide")) {}
        const value = event.payload.text;
        console.log(value)
        if (launchers[value]) {
            launchers[value].leftClick();
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
                left: event.deltaY, // Scroll more aggressively
                behavior: 'smooth'
            });
        }
    })


    listen("import_done", async (event) => {
        document.getElementById("loadingsub").textContent = "Mod Imported | Loading GUI"
        setTimeout(() => {
            if (alert_path !== undefined) {
                remove(alert_path)
                alert_path = undefined;
            }
        })
        await requestDirectory(selectedPath)
        let goal = event.payload.text;
        if (launchers[goal]) {
            launchers[goal].leftClick();
        } else {
            console.log(goal + " Not Found!")
        }
    })

    // Opens Up A Spreadsheet Full Of DDLC Mods

    document.getElementById("spreadsheet").addEventListener("mouseup", async () => {


        play(sound_beep)
        if (!await warn_path_alert()) return;

        window.open("https://docs.google.com/spreadsheets/d/1lgQD8o7qhdWmrwdJjbRv3u_bwdrXmpOzaixWFzLR8r4/edit?usp=sharing",'reddit','width=1200,height=600')
    })

    // Opens Up DDLCMods Subreddit

    document.getElementById("reddit").addEventListener("mouseup", async () => {

        play(sound_beep)
        if (!await warn_path_alert()) return;

        window.open("https://www.reddit.com/r/DDLCMods/",'reddit','width=1200,height=600')
    })

    // Opens up DokiMods

    document.getElementById("dokimods").addEventListener("mouseup", async () => {

        play(sound_beep)
        if (!await warn_path_alert()) return;

        window.open("https://dokimods.me/",'dokimods','width=1200,height=600')
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
        await invoke("open_path", {path: alert_path})
    })

    // Accept Mod Download

    document.getElementById("download").addEventListener("mouseup", async () => {
        if (alert_path !== undefined) {
            play(sound_beep)
            showContainers(true)
            document.getElementById("alert").classList.add("hide")
            await import_mod(alert_path)
            alert_path = undefined;
        }
    })

    document.getElementById("loader").classList.remove("hide")
    document.getElementById("main").classList.add("hide")
    document.getElementById("loadingsub").textContent = "Installing DDLC-Vanilla"

    // Drag Drop Handling
    // This is for dragging and dropping images and mods

    listen('tauri://drag-drop', async (event) => {
        let paths = event.payload.paths;
        for (const path of paths) {
            if (path.endsWith(".zip") || path.endsWith(".rar")) {
                await import_mod(path)
            } else {
                await writeFile(local_path + "\\store\\images\\" + path.split("\\").pop(), await readFile(path))

            }
        }
        setTimeout(async () => {
            await update_cover_images()
        }, 1000)
    });

    // This is what is recieved when you import a mod
    // This is also the first handshake handler that tells the frontend (this) to listen to the downloads folder

    listen("pathRespond", async (event) => {
        if (!reset) {
            let newest_version = await getVersion();
            if (newest_version !== CLIENT_VERSION) {
                console.warn("NOT UP TO DATE")
                document.getElementById("version").innerHTML = `(${CLIENT_VERSION}) <u>Update</u>`
                let response = await confirm("Please Update To The Latest Version\nGoto Latest Releases?");
                if (response) {
                    await invoke("update")
                    return;
                }
            } else {
                document.getElementById("version").textContent = `(${CLIENT_VERSION})`
            }
            reset = true;
            await loadConfig(event.payload.local_path)
            await home_main()
            let payloadPath = event.payload.path;
            await watch(
                event.payload.path,
                async (event) => {
                    for (const index in event.paths) {
                        const path = event.paths[index];
                        setTimeout(async () => {
                            if ((path.endsWith(".zip") || path.endsWith(".rar")) && await isExist(path)) {
                                document.getElementById("alert").classList.remove("hide")
                                showContainers(false)
                                alert_path = path
                                const split = path.split("\\");
                                const data = await metadata(path);

                                document.getElementById("alert-size").innerText = Math.floor(data.size / 1048600).toString() + "mb";

                                document.getElementById("alert-pth").innerText = payloadPath;
                                document.getElementById("alert-name").textContent = split[split.length - 1].split(".")[0];
                            }
                        }, 1000)
                    }
                },
                {
                    delayMs: 500
                }
            )
        }
        try {
            await requestDirectory(event.payload.final_data)
            await home_main()
        } catch (e) {}

    })

    listen('closed', async (event) => {
        if (event.payload.id !== "") {
            await launchers[event.payload.id].close();
        }
    });

    listen('popup', async (event) => {
        await confirm(event.payload.text)
    });

    listen('substring', async (event) => {
        document.getElementById("loadingsub").textContent = event.payload.text
    });

    document.getElementById("rename").addEventListener("focusout", async (event) => {
        await rename_mod()
    })

    document.getElementById("rename").addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            await rename_mod()
        }
    })

    document.getElementById("setauthor").addEventListener("focusout", async (event) => {
        await setauthor()
    })

    document.getElementById("setauthor").addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            await setauthor()
        }
    })

    document.getElementById("update").addEventListener("mouseup", async () => {
        document.getElementById("update-log").classList.toggle("hide");
    })

    document.getElementById("play").addEventListener("mouseup", async (event) => {
        if (currentEntry !== "") {
            await launchers[currentEntry].open();
        }
    })

    document.getElementById("cover-next").addEventListener("mouseenter", () => {mouse_cover_available = true})
    document.getElementById("cover-next").addEventListener("mouseleave", () => {mouse_cover_available = false})
    document.getElementById("cover-last").addEventListener("mouseenter", () => {mouse_cover_available = true})
    document.getElementById("cover-last").addEventListener("mouseleave", () => {mouse_cover_available = false})

    document.getElementById("cove").addEventListener("mouseup", async (event) => {
        if (currentEntry !== "" && !mouse_cover_available) {
            await launchers[currentEntry].oncove()
        }
    })


    document.getElementById("delete").addEventListener("mouseup", async (event) => {
        if (currentEntry !== "") {
            let confirmed = await confirm("Are you sure you want to delete '" + launchers[currentEntry].location + "' and its data?")
            if (confirmed) {
                await invoke("delete_path", {path: launchers[currentEntry].location});
                await home_main()
                await requestDirectory(selectedPath);
            }
        }
    })

    document.getElementById("path").addEventListener("mouseup", async (event) => {
        if (currentEntry !== "") {
            await launchers[currentEntry].path();
        }
    })


    document.getElementById("options").addEventListener("mouseup", async () => {
        play(sound_beep)

        await home_main()
    })

    document.getElementById("cover-next").addEventListener("mouseup", async (e) => {
        if (currentEntry !== "" && e.button === 0) {
            await launchers[currentEntry].nextCover();
        } else if (e.button === 0) {
            background_cover++;
            if (background_cover > covers.length - 1) {
                background_cover = 0;
            }
            await setCover(background_cover)
        }
    })

    document.getElementById("cover-last").addEventListener("mouseup", async (e) => {
        if (currentEntry !== "" && e.button === 0) {
            await launchers[currentEntry].lastCover();
        } else if (e.button === 0) {
            background_cover--;
            if (background_cover < 0) {
                background_cover = covers.length - 1;
            }
            await setCover(background_cover)
        }
    })

    document.getElementById("close").addEventListener("mouseup", async () => {
        document.getElementById("loader").classList.remove("hide")
        document.getElementById("main").classList.add("hide")
        document.getElementById("loadinghead").textContent = "Closing..."
        document.getElementById("loadingsub").textContent = "Saving Data..."


        setTimeout(() => {
            invoke("close");
        }, 1000)
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
            for (const index in launchers) {
                const element = launchers[index];
                element.item.classList.remove("hide2");
            }
        } else {
            for (const index in launchers) {
                const element = launchers[index];
                if (element.item.id.toLowerCase().includes(event.target.value.toLowerCase())) {
                    element.item.classList.remove("hide2");
                } else {
                    element.item.classList.add("hide2");
                }
            }
        }
    })

    document.getElementById("themeselect").addEventListener("mouseup", async () => {
        let next = CLIENT_THEME_ENUM.indexOf(localConfig.config.theme) + 1;
        if (next > CLIENT_THEME_ENUM.length - 1) {
            next = 0;
        }
        await setTheme(CLIENT_THEME_ENUM[next]);
    })

    document.getElementById("importimage").addEventListener("mouseup", async () => {
        await invoke("open_path", {path: local_path + "\\store\\images"})
    })


    document.getElementById("import").addEventListener("mouseup", async () => {
        play(sound_beep)
        await import_mod();
    })

    setInterval(update_concurrent_game, 1000)

    invoke("request_path")
}

createApp(App).mount("#app");
addEventListener("DOMContentLoaded", onLoad)