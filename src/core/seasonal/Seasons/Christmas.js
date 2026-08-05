import {getCurrentWindow} from "@tauri-apps/api/window";
import jingle from "../../../assets/jingle_punks_copyrightfree.mp3";

let jingle_audio = new Audio(jingle);

class Christmas {

    constructor() {
    }

    async init() {
        setInterval(this.snowflake, 100)
        await getCurrentWindow().onFocusChanged(async (
            {payload: isFocused}
        ) => {
            if (isFocused) {
                await jingle_audio.play()
            } else {
                jingle_audio.pause()
            }
        });
        jingle_audio.volume = 0.5;
        jingle_audio.loop = true;
        await jingle_audio.play()
    }

    /**
     * Christmas Snowflake Animation
     * @returns {void}
     */

    snowflake() {
        if (!jingle_audio.paused) {
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
        };
    }
}

export default new Christmas()