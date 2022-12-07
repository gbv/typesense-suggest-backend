import config from "./config/index.js"
import jskos from "jskos-tools"
import { cdk } from "cocoda-sdk"
import fs from "fs/promises"
import { downloadFile } from "./lib/utils.js"
import anystream from "json-anystream"

const bartocRegistry = cdk.initializeRegistry(config.schemeRegistry)
const mappingRegistries = config.mappingRegistries.map(registry => cdk.initializeRegistry(registry))

// TODO
const uri = "http://bartoc.org/en/node/18785"

// SQLite database used to cache concept data loaded for mappings
import Database from "better-sqlite3"

main()
async function main() {
  // Init all registries
  console.log("Initialize all registries...")
  await Promise.all(mappingRegistries.concat(bartocRegistry).map(registry => registry.init()))
  console.log("... all registries initialized.")

  const schemes = await bartocRegistry.getSchemes({ params: { limit: 3000 }})
  console.log(`Loaded ${schemes.length} compatible vocabularies.`)
  const scheme = schemes.find(s => jskos.compare(s, { uri }))
  const notation = jskos.notation(scheme)

  // 1. Download all concepts of scheme, if necessary
  const conceptsFile = `./${notation}-concepts.ndjson`
  try {
    // Check if file exists
    await fs.stat(conceptsFile)
    console.log(`Using already downloaded concept data for ${notation} in ${conceptsFile}.`)
  } catch (error) {
    // If not, download the data
    // TODO: Normally, you would use scheme.distributions for detecting the download, but it does not work for BK
    const download = "https://api.dante.gbv.de/export/download/bk/default/bk__default.jskos.ndjson"
    console.log(`Downloading ${notation} from ${download}...`)
    await downloadFile(download, conceptsFile)
    console.log("... download of concept data done.")
  }

  // 2. Download mapping data
  // Note: We're not using cocoda-sdk here because we want to download the whole file.
  // TODO: Once everything works, we want to redownload the mappings to update the data.
  await Promise.all(mappingRegistries.map(async (registry, index) => {
    const mappingFile = `./${notation}-mappings-${index}.ndjson`
    try {
      // Check if file exists
      await fs.stat(mappingFile)
      console.log(`Using already downloaded mapping data for ${notation} in ${mappingFile} (${index}).`)
    } catch (error) {
      // If not, download the data
      const download = `${registry._api.mappings}?properties=annotations&toScheme=${encodeURIComponent(scheme.uri)}&direction=both&download=ndjson`
      console.log(`Downloading ${notation} mappings from ${download} (${index})...`)
      await downloadFile(download, mappingFile)
      console.log(`... download of mappings done (${index}).`)
    }
  }))

  // 3. Load concept data into memory
  console.log(`Loading concept data from ${conceptsFile} into memory...`)
  const conceptData = {}
  const conceptDataStream = await anystream.make(conceptsFile)
  for await (const concept of conceptDataStream) {
    conceptData[concept.uri] = concept
  }
  console.log(`... concept data loaded (${Object.keys(conceptData).length} concepts).`)

  // 4. Attaching mappings to concept data
  await Promise.all(mappingRegistries.map(async (registry, index) => {
    const mappingFile = `./${notation}-mappings-${index}.ndjson`
    console.log(`Loading mappings data from ${mappingFile} into the concept data (${index})...`)
    const mappingDataStream = await anystream.make(mappingFile)
    let count = 0
    for await (const mapping of mappingDataStream) {
      count += 1
      const side = jskos.compare(mapping.fromScheme, scheme) ? "from" : "to"
      const otherSide = side === "from" ? "to" : "from"
      const otherScheme = mapping[`${otherSide}Scheme`]
      // Find concept(s) in our scheme
      const concepts = jskos.conceptsOfMapping(mapping, side).map(({ uri }) => conceptData[uri]).filter(Boolean)
      // Find other concepts
      const otherConcepts = jskos.conceptsOfMapping(mapping, otherSide).map(({ uri }) => ({ uri, inScheme: [{ uri: otherScheme.uri }]}))
      // Attach otherConcepts to all concepts
      concepts.forEach(concept => {
        // We're attaching the concepts in the `mappings` field, but that's okay. 😅
        concept._mappings = (concept._mappings ?? []).concat(otherConcepts)
      })
    }
    console.log(`... mapping data loaded (${count} mappings, ${index}).`)
  }))

  // 5. Prepare SQLite database for mapping concept cache
  const db = new Database("mapping-concept-cache.db")
  db.pragma("journal_mode = WAL")
  db.prepare(`CREATE TABLE IF NOT EXISTS concepts (
    uri TEXT PRIMARY KEY,
    label TEXT
  )`).run()

  // 6. Load concept data for attached mappings (either from cache or API)
  const incompatibleSchemes = []
  let cachedCount = 0, failedCount = 0, loadedCount = 0
  console.log("Loading concept data for mappings...")
  for (const concept of Object.values(conceptData)) {
    for (const mappingConcept of concept._mappings || []) {
      const inScheme = mappingConcept.inScheme[0]
      const scheme = schemes.find(s => jskos.compare(s, inScheme))
      if (!scheme?._registry?.getConcepts) {
        if (!incompatibleSchemes.includes(inScheme.uri)) {
          incompatibleSchemes.push(inScheme.uri)
        }
      } else {
        // First, try the cache database
        const label = db.prepare("SELECT * FROM concepts WHERE uri = ?").get(mappingConcept.uri)?.label
        if (!label) {
          // Load data from API instead
          try {
            const [result] = await scheme._registry.getConcepts({ concepts: [mappingConcept] })
            const label = jskos.prefLabel(result, { fallbackToUri: false })
            if (!label) throw new Error()
            db.prepare("INSERT INTO concepts (uri, label) VALUES (?, ?)").run(mappingConcept.uri, label)
            loadedCount += 1
            mappingConcept.prefLabel = { de: label }
          } catch (error) {
            failedCount += 1
          }
        } else {
          cachedCount += 1
          mappingConcept.prefLabel = { de: label }
        }
      }
    }
  }
  console.log(`... loaded ${loadedCount} concepts from API.`)
  console.log(`... loaded ${cachedCount} concepts from cache.`)
  console.log(`... failed to load ${failedCount} concepts.`)
  incompatibleSchemes.length > 0 && console.log(`... ${incompatibleSchemes.length} incompatible vocabularies: ${incompatibleSchemes}`)
}
