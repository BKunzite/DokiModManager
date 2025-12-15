import { getImage } from "../core/ImageUtils"

self.onmessage =  async (event) => {
    loadImage(event.data["image"])
}
export default function loadImage(image) {
    getImage(image, []).then(url => {self.postMessage(url)})
}