// Read config.json file. In the future, this could be replaced with an import assertion.
import { readFileSync } from "fs"
const configDefault = JSON.parse(readFileSync(new URL("./config.default.json", import.meta.url)))
const config = Object.assign({}, configDefault, JSON.parse(readFileSync(new URL("./config.json", import.meta.url))))

if (![true, false, "log", "warn", "error"].includes(config.verbosity)) {
  console.warn(`Invalid verbosity value "${config.verbosity}", defaulting to "${configDefault.verbosity}" instead.`)
  config.verbosity = configDefault.verbosity
}

// Logging functions
config.log = (...args) => {
  if (config.env != "test" && (config.verbosity === true || config.verbosity === "log")) {
    console.log(new Date(), ...args)
  }
}
config.warn = (...args) => {
  if (config.env != "test" && (config.verbosity === true || config.verbosity === "log" || config.verbosity === "warn")) {
    console.warn(new Date(), ...args)
  }
}
config.error = (...args) => {
  if (config.env != "test" && config.verbosity !== false) {
    console.error(new Date(), ...args)
  }
}

export default config
