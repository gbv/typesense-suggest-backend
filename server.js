import config from "./config/index.js"
import * as utils from "./lib/utils.js"

// Initialize express with settings
import express from "express"
export const app = express()
app.set("json spaces", 2)
if (config.proxies && config.proxies.length) {
  app.set("trust proxy", config.proxies)
}

app.use((req, res, next) => {
  if (req.headers.origin) {
    // Allow all origins by returning the request origin in the header
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
  } else {
    // Fallback to * if there is no origin in header
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET")
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Link")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  next()
})

// Load compatible schemes from database
import Database from "better-sqlite3"
const db = new Database(config.database)
const schemes = db.prepare("SELECT * FROM schemes").all().map(s => Object.assign({ _key: s.key }, JSON.parse(s.json)))

import typesense from "./lib/typesense.js"
import jskos from "jskos-tools"

app.get(
  "/search",
  utils.wrappers.async(async (req) => {
    // Check if vocabulary is compatbile
    const scheme = schemes.find(s => jskos.compare(s, { uri: req.query.voc }))
    if (!scheme) {
      throw new Error(`Incompatible scheme: ${req.query.voc}`)
    }
    if (!req.query.search) {
      return []
    }
    // Get results from Typesense backend
    const collection = `${jskos.notation(scheme)}-suggestions`
    const limit = parseInt(req.query.limit) || 100
    const offset = parseInt(req.query.offset) || 0
    const per_page = limit
    const page = Math.floor(offset / limit + 1)
    if (!await typesense.exists(collection)) {
      return []
    }
    const result = await typesense.search(collection, req.query.search, ["identifier", "prefLabel", "altLabel", "mappingLabelsExactClose", "mappingLabelsNarrowBroad", "notes"], { per_page, page })
    // Return concept data only
    return result.hits.map(hit => {
      const concept = hit.document.concept
      // Reduce concept data a bit
      // TODO: Maybe do this during import already
      delete concept._mappings
      delete concept.ancestors
      delete concept.narrower
      ;["broader", "inScheme"].forEach(key => {
        if (Array.isArray(concept[key])) {
          concept[key] = concept[key].map(({ uri }) => ({ uri }))
        }
      })
      return concept
    })
  }),
  utils.returnJSON,
)

const start = async () => {
  // if (config.env == "test") {
  //   const portfinder = require("portfinder")
  //   portfinder.basePort = config.port
  //   config.port = await portfinder.getPortPromise()
  // }
  app.listen(config.port, () => {
    config.log(`Now listening on port ${config.port}`)
  })
}
// Start express server immediately even if database is not yet connected
start()
