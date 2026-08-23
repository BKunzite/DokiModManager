import sound_beep from '../../assets/select.ogg';
import sound_boop from '../../assets/hover.ogg';
import sound_click from '../../assets/pageflip.ogg';
import dart_sfx from '../../assets/dart_sfx.mp3';

class SoundManager {
    CLICK_SOUND = sound_click
    BOOP_SOUND = sound_boop
    BEEP_SOUND = sound_beep
    DART_SOUND = dart_sfx

    /**
     * Plays Sound
     * @param {{}} song
     */

    play(song) {
	let beep = new Audio(song)
	beep.volume = 0.5;

	beep.play().then(() => {
	})
    }
}


export default {
    Sound: new SoundManager()
}
