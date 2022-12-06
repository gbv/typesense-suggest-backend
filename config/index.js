// Read config.json file. In the future, this could be replaced with an import assertion.
import { readFileSync } from "fs"
const config = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)))

export default config
