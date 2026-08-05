import Christmas from './Seasons/Christmas';
import Logger from "../utils/Logger";

class SeasonsManager {
    SEASON = {
	'NONE': 'None',
	'CHRISTMAS': 'Christmas'
    }

    async init(season = this.SEASON.NONE) {
	switch (season) {
	    case this.SEASON.CHRISTMAS:
		await Christmas.init()
		break;
	    case this.SEASON.NONE:
		break;
	}
    }
}

export default new SeasonsManager()