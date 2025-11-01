import { createApp } from "vue";
import App from "./App.vue";
import { readDir, readTextFile, create, writeTextFile, watch, remove, rename, copyFile } from '@tauri-apps/plugin-fs';
import {message, open} from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { metadata, isExist } from "tauri-plugin-fs-pro-api";
import { homeDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import {path} from "@tauri-apps/api";

import sound_beep from './assets/beep.mp3'
import sound_boop from './assets/boop.mp3'
import sound_click from './assets/click.mp3'

let launchers = []
let currentEntry = ""
let covers = [
    "cover.png",
    "cover2.png",
    "cover3.webp",
    "cover4.webp",
    "cover5.webp",
    "cover6.webp",
    "cover7.png",
    "cover8.webp",
]


document.oncontextmenu = document.body.oncontextmenu = function() {return false;}
createApp(App).mount("#app");
async function listDirectoryContents(directoryHandle, parentPath) {
    for await (const entry of directoryHandle.values()) {
        const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    }
}

let alert_path = ""
let selectedPath;
const heart_empty = "&#xe030;";
const heart_full = "&#xe089;";

function play(song) {
    var beep = new Audio(song)
    if (song === sound_boop || song === sound_beep) {
        beep.volume = 0.01;
    } else {
        beep.volume = 0.25;
    }
    beep.play()
}

async function import_mod(path) {
    let selectedPath = path
    if (selectedPath === undefined) {
        selectedPath = await open({
            directory: false, // This tells it to select a directory
            multiple: false, // We only want one directory
            title: 'Select Your DDLC Directory'
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

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("sidevisible");
        } else {
            entry.target.classList.remove("sidevisible");
        }
    });
})


document.querySelectorAll(".sidebutton2").forEach(element => observer.observe(element));

async function setCover(id) {
    for (let i = 1; i <= covers.length; i++) {
        if (i === id) {
            document.getElementById("cove").classList.add("cover" + i)
        } else {
            document.getElementById("cove").classList.remove("cover" + i)
        }
    }
    console.log(document.getElementById("cove").style.backgroundImage)

}

async function requestDirectory(path) {
    let ppath = undefined;
    console.log(path)
    if (path === undefined) {
        ppath = await open({
            directory: true, // This tells it to select a directory
            multiple: false, // We only want one directory
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
        document.getElementById("source").innerHTML = " <span style=\"font-family: Icon,serif\">&#x6f</span> Set Install Location | " + selectedPath
        console.log(readDir(selectedPath))
        const files = await readDir(selectedPath);
        document.getElementById("nummods").textContent = files.length;
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
                    console.log(configData)

                }
                if (configData.coverId === undefined || configData.coverId === null) {
                    configData.coverId = 0;
                }
                const shorthand = entry.name.replace("ddlc-","").replace("ddlc","").replace("-"," ");
                const sidetext = document.createElement("header");
                const normalText = "<span style=\"font-family: Icon,serif\">m</span><span style='padding-left: 1vw'></span>" + shorthand;
                const faveText = "<span style=\"font-family: Icon,serif\">&#xe089</span><span style='padding-left: 1vw'></span>" + shorthand;

                let launch_time = 0;
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
                        play(sound_click)
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
                            console.log(dir + "\\" + gameExe)
                            await invoke("launch", {path: dir + "\\" + gameExe, id: entry.name})
                        }

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
                        console.log(configData.coverId)
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
                        document.getElementById("cove").innerHTML = configData.favorite ? heart_full : heart_empty;
                    },
                    close: async () => {
                        play(sound_boop)
                        configData.time += Date.now() - launch_time;
                        const data = await metadata(selectedPath + "\\" + entry.name);
                        const contents = JSON.stringify(configData);
                        configData.size = data.size;
                        console.log(data)

                        await writeTextFile(configPath, contents);
                        const min = Math.floor(configData.time/60000);
                        await launchers[entry.name].leftClick();
                    },
                    leftClick: async () => {
                        let renpy;
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
                        let customExe;
                        let about ;
                        const dirFiles = await readDir(dir + "\\renpy");
                        const fdirFiles = await readDir(dir);
                        await setCover(configData.coverId);
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
                        for (const localEntry of fdirFiles) {
                            if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe") && localEntry.name !== "DDLC.exe" && customExe === undefined) {
                                customExe = localEntry.name;
                            }
                            if (localEntry.name.toLowerCase().includes("credit") && about === undefined) {
                                about = (await readTextFile(dir + "\\" + localEntry.name)).replaceAll("\n", "<br>");
                            }
                        }
                        if (renpy === undefined) {
                            renpy = "Unknown";
                        }
                        renpy = "Renpy: " + renpy + "<br>Custom Exe: " + (customExe !== undefined ? "Yes | " + customExe : "No") + "<br><br>Credits: <br>" + (about !== undefined ? about : "None Found!");
                        document.getElementById("cove").innerHTML = configData.favorite ? heart_full : heart_empty;
                        play(sound_beep)
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

listen("import_done", async (event) => {
    document.getElementById("loadingsub").textContent = "Mod Imported | Loading GUI"
    setTimeout(() => {
        if (alert_path !== undefined) {
            remove(alert_path)
            alert_path = undefined;
        }
    })
    await requestDirectory(selectedPath)
})
document.getElementById("spreadsheet").addEventListener("mouseup", async () => {
    await confirm("Remember To Save To C:\\\\User\\\\Downloads!")

    play(sound_beep)
    window.open("https://docs.google.com/spreadsheets/d/1lgQD8o7qhdWmrwdJjbRv3u_bwdrXmpOzaixWFzLR8r4/edit?usp=sharing",'reddit','width=1200,height=600')
})
document.getElementById("reddit").addEventListener("mouseup", async () => {
    await confirm("Remember To Save To C:\\\\User\\\\Downloads!")

    play(sound_beep)

    window.open("https://www.reddit.com/r/DDLCMods/",'reddit','width=1200,height=600')
})
document.getElementById("dokimods").addEventListener("mouseup", async () => {
    await   confirm("Remember To Save To C:\\\\User\\\\Downloads!")

    play(sound_beep)

    window.open("https://dokimods.me/",'dokimods','width=1200,height=600')
})


document.getElementById("cancel").addEventListener("mouseup", async () => {
    play(sound_beep)
    document.getElementById("alert").classList.add("hide")

})

document.getElementById("download").addEventListener("mouseup", async () => {
    if (alert_path !== undefined) {
        play(sound_beep)
        document.getElementById("alert").classList.add("hide")
        await import_mod(alert_path)
    }
})
document.getElementById("loader").classList.remove("hide")
document.getElementById("main").classList.add("hide")
let reset = false;
document.getElementById("loadingsub").textContent = "Installing DDLC-Vanilla"
listen("pathRespond", async (event) => {
    if (!reset) {
        reset = true;
        setTimeout(async () => {
            await watch(
                event.payload.path,
                (event) => {
                    console.log(event.paths)
                    for (const index in event.paths) {
                        const path = event.paths[index];
                        setTimeout(async () => {
                            if ((path.endsWith(".zip") || path.endsWith(".rar")) && await isExist(path)) {
                                document.getElementById("alert").classList.remove("hide")
                                console.log("New Zip Detected | " + path)
                                alert_path = path
                                const split = path.split("\\");
                                document.getElementById("downloaded").textContent = split[split.length - 1];
                            }
                        }, 1000)

                    }

                },
                {
                    delayMs: 500
                }
            )
        }, 0)
    }
    try {
        await requestDirectory(event.payload.final_data)
        await updateDisplayinfo("Welcome, " + (await homeDir()).replace("C:\\Users\\",""), "", "", "")
    } catch (e) {}

})

listen('closed', async (event) => {
    console.log(event.payload)
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

async function updateDisplayinfo(mod, author, space, time, renpy) {
    const shorthand = mod.replace("ddlc-","").replace("ddlc","").replace("-"," ");
   if (shorthand.length < 20) {
       document.getElementById("modtitle").textContent = shorthand
    } else {
       document.getElementById("modtitle").textContent = shorthand.substring(0,15) + "..."
    };
    document.getElementById("modtitle").classList.remove("hide");
    document.getElementById("modinfo").classList.remove("hide");
    document.getElementById("cove").classList.remove("hide");

    if (author.length > 0) {
        currentEntry = mod;

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
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon;\">w</span> " + author + " <span style=\"font-family: Icon; padding-left: 20px;\">m</span> " + space + " <span style=\"font-family: Icon; padding-left: 20px;\">&#x7d</span> " + time;
    } else {
        currentEntry = ""
        await setCover(1)
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
        document.getElementById("modinfo").innerHTML = ""
    }
}

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
            await rename(oldName, newName)
            await updateDisplayinfo("Welcome, " + (await homeDir()).replace("C:\\Users\\",""), "", "", "")
            await requestDirectory(selectedPath);
        } catch (e) {
            console.log(e)
            confirm("The Name '" + value + "' is invalid!")
        }

    }
}

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

document.getElementById("play").addEventListener("mouseup", async (event) => {
    if (currentEntry !== "") {
        console.log(currentEntry)
        await launchers[currentEntry].open();
    }
})

document.getElementById("cove").addEventListener("mouseup", async (event) => {
    if (currentEntry !== "") {
        await launchers[currentEntry].oncove()
    }
})


document.getElementById("delete").addEventListener("mouseup", async (event) => {
    if (currentEntry !== "") {
        console.log(currentEntry)
        let confirmed = await confirm("Are you sure you want to delete '" + launchers[currentEntry].location + "' and its data?")
        if (confirmed) {
            await invoke("delete_path", {path: launchers[currentEntry].location});
            await updateDisplayinfo("Welcome, " + (await homeDir()).replace("C:\\Users\\",""), "", "", "")
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

    await updateDisplayinfo("Welcome, " + (await homeDir()).replace("C:\\Users\\",""), "", "", "")
})

document.getElementById("cover-update").addEventListener("mouseup", async (e) => {
    if (currentEntry !== "" && e.button === 0) {
        await launchers[currentEntry].nextCover();
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

document.getElementById("import").addEventListener("mouseup", async () => {
    play(sound_beep)
    await import_mod();
})

invoke("request_path")