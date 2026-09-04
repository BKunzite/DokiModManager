import Christmas from "./Seasons/Christmas";

class SeasonsManager {
    SEASON = {
        "NONE": "0",
        "CHRISTMAS": "1",
    };

    async init(season = this.SEASON.NONE) {
        switch (season) {
            case this.SEASON.CHRISTMAS:
                await Christmas.init();
                break;
            case this.SEASON.NONE:
                break;
        }
    }

    unfocus(season = this.SEASON.NONE) {
        switch (season) {
            case this.SEASON.CHRISTMAS:
                Christmas.unfocus();
                break;
        }
    }

    focus(season = this.SEASON.NONE) {
        switch (season) {
            case this.SEASON.CHRISTMAS:
                Christmas.focus();
                break;
        }
    }
}

export default new SeasonsManager();
