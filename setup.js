import config from "./config/index.js"
import jskos from "jskos-tools"
import { cdk } from "cocoda-sdk"
import fs from "fs/promises"
import { downloadFile } from "./lib/utils.js"
import * as anystream from "json-anystream"

const bartocRegistry = cdk.initializeRegistry(config.schemeRegistry)
const mappingRegistries = config.mappingRegistries.map(registry => cdk.initializeRegistry(registry))

const [,, uri = "http://bartoc.org/en/node/18785", downloadUrl] = process.argv

const vocabularyDownloads = {
  BK: "https://api.dante.gbv.de/export/download/bk/default/bk__default.jskos.ndjson",
  RVK: "https://coli-conc.gbv.de/rvk/data/2023_4/rvko_2023_4.ndjson",
}

import typesense from "./lib/typesense.js"

function isCombinedConcept(concept) {
  return (concept?.type || []).includes("http://rdf-vocabulary.ddialliance.org/xkos#CombinedConcept")
}

/**
 * Maps a concept to a document for importing it into Typesense. The document will have the following structure:
 *
 * {
 *    id: string (URI),
 *    concept: unmodified JSKOS concept data,
 *    identifier: list of strings (URI, identifier, notations),
 *    prefLabel: list of strings (all preferred labels); empty for combined concepts,
 *    altLabel: list of strings (all alternative labels); empty for combined concepts,
 *    mappingLabels: list of strings (labels of mappings for this concept); empty for combined concepts,
 *    notes: list of strings (notes = scopeNote and editorialNote); empty for combined concepts,
 * }
 */
function mapConcept(concept) {
  if (!concept || !concept.uri || !concept.prefLabel) {
    return null
  }
  const document = {
    id: concept.uri,
    concept,
    identifier: [concept.uri].concat(concept.identifier || [], concept.notation),
    prefLabel: [],
    altLabel: [],
    mappingLabelsExactClose: [],
    mappingLabelsNarrowBroad: [],
    mappingLabelsOther: [],
    notes: [],
  }
  if (!isCombinedConcept(concept)) {
    document.prefLabel = Object.values(concept.prefLabel)
    document.altLabel = [].concat(...Object.values(concept.altLabel || {}))
    document.mappingLabelsExactClose = concept._mappings.exactClose.map(mapping => mapping.prefLabel?.de).filter(Boolean)
    document.mappingLabelsNarrowBroad = concept._mappings.narrowBroad.map(mapping => mapping.prefLabel?.de).filter(Boolean)
    document.mappingLabelsOther = concept._mappings.other.map(mapping => mapping.prefLabel?.de).filter(Boolean)
    document.notes = [].concat(...Object.values(concept.scopeNote || {}), ...Object.values(concept.editorialNote || {}))
  }
  return document
}

const mappingTypeMap = {
  "http://www.w3.org/2004/02/skos/core#mappingRelation": "other",
  "http://www.w3.org/2004/02/skos/core#closeMatch": "exactClose",
  "http://www.w3.org/2004/02/skos/core#exactMatch": "exactClose",
  "http://www.w3.org/2004/02/skos/core#broadMatch": "narrowBroad",
  "http://www.w3.org/2004/02/skos/core#narrowMatch": "narrowBroad",
  "http://www.w3.org/2004/02/skos/core#relatedMatch": "other",

}

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

  // Download all concepts of scheme, if necessary
  const conceptsFile = `${config.cache}/${notation}-concepts.ndjson`
  try {
    // Check if file exists
    await fs.stat(conceptsFile)
    console.log(`Using already downloaded concept data for ${notation} in ${conceptsFile}.`)
  } catch (error) {
    // If not, download the data
    // TODO: Normally, you would use scheme.distributions for detecting the download, but it does not seem to be implemented in BARTOC yet.
    const download = downloadUrl || vocabularyDownloads[notation]
    if (!download) {
      console.error(`No download URL available for ${notation}. Currently, download URLs are hardcoded, but can also be given as the second parameter.`)
      process.exit(1)
    }
    console.log(`Downloading ${notation} from ${download}...`)
    await downloadFile(download, conceptsFile)
    console.log("... download of concept data done.")
  }

  // Download mapping data
  // Note: We're not using cocoda-sdk here because we want to download the whole file.
  // TODO: Once everything works, we want to redownload the mappings to update the data.
  await Promise.all(mappingRegistries.map(async (registry, index) => {
    const mappingFile = `${config.cache}/${notation}-mappings-${index}.ndjson`
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

  // Load concept data into memory
  console.log(`Loading concept data from ${conceptsFile} into memory...`)
  const conceptData = {}
  const conceptDataStream = await anystream.make(conceptsFile)
  for await (const concept of conceptDataStream) {
    conceptData[concept.uri] = concept
    concept._mappings = {
      exactClose: [],
      narrowBroad: [],
      other: [],
    }
  }
  console.log(`... concept data loaded (${Object.keys(conceptData).length} concepts).`)

  // Attaching mappings to concept data
  await Promise.all(mappingRegistries.map(async (registry, index) => {
    const mappingFile = `${config.cache}/${notation}-mappings-${index}.ndjson`
    console.log(`Loading mappings data from ${mappingFile} into the concept data (${index})...`)
    const mappingDataStream = await anystream.make(mappingFile)
    let count = 0
    for await (const mapping of mappingDataStream) {
      count += 1
      if (!mapping) {
        continue
      }
      // Make sure mapping type is given
      if (!mapping.type?.[0]) {
        mapping.type = ["http://www.w3.org/2004/02/skos/core#mappingRelation"]
      }
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
        concept._mappings[mappingTypeMap[mapping.type[0]]] = concept._mappings[mappingTypeMap[mapping.type[0]]].concat(otherConcepts)
      })
    }
    console.log(`... mapping data loaded (${count} mappings, ${index}).`)
  }))

  // Prepare SQLite database for mapping concept cache
  const db = new Database(config.database)
  db.pragma("journal_mode = WAL")
  db.prepare(`CREATE TABLE IF NOT EXISTS mapping_concepts (
    uri TEXT PRIMARY KEY,
    label TEXT
  )`).run()
  db.prepare(`CREATE TABLE IF NOT EXISTS schemes (
    key TEXT PRIMARY KEY,
    json TEXT
  )`).run()

  // Add compatible scheme to database
  db.prepare("INSERT INTO schemes (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json=excluded.json").run(notation, JSON.stringify((({ uri, identifier, notation }) => ({ uri, identifier, notation }))(scheme)))

  // Load concept data for attached mappings (either from cache or API)
  const incompatibleSchemes = [], conceptsToLoad = {}
  let totalCount = 0, cachedCount = 0, incompatibleCount = 0, failedCount = 0, loadedCount = 0
  const loadConcepts = async (scheme) => {
    const concepts = conceptsToLoad[scheme.uri]
    try {
      const results = await scheme._registry.getConcepts({ concepts })
      for (const mappingConcept of concepts) {
        const result = results.find(c => jskos.compare(c, mappingConcept))
        const label = jskos.prefLabel(result, { fallbackToUri: false })
        if (!label || !result) {
          failedCount += 1
          continue
        }
        db.prepare("INSERT INTO mapping_concepts (uri, label) VALUES (?, ?) ON CONFLICT(uri) DO UPDATE SET label=excluded.label").run(mappingConcept.uri, label)
        loadedCount += 1
        mappingConcept.prefLabel = { de: label }
      }
    } catch (error) {
      failedCount += concepts.length
    }
    conceptsToLoad[scheme.uri] = []
  }
  console.log("Loading concept data for mappings...")
  for (const concept of Object.values(conceptData)) {
    for (const mappingConcept of [].concat(concept._mappings.exactClose, concept._mappings.narrowBroad, concept._mappings.other)) {
      const inScheme = mappingConcept.inScheme[0]
      const scheme = schemes.find(s => jskos.compare(s, inScheme))
      if (!scheme?._registry?.getConcepts) {
        if (!incompatibleSchemes.includes(inScheme.uri)) {
          incompatibleSchemes.push(inScheme.uri)
        }
        incompatibleCount += 1
      } else {
        // First, try the cache database
        const label = db.prepare("SELECT * FROM mapping_concepts WHERE uri = ?").get(mappingConcept.uri)?.label
        if (!label) {
          if (!conceptsToLoad[scheme.uri]) {
            conceptsToLoad[scheme.uri] = []
          }
          conceptsToLoad[scheme.uri].push(mappingConcept)
          if (conceptsToLoad[scheme.uri].length >= 20) {
            await loadConcepts(scheme)
          }
        } else {
          cachedCount += 1
          mappingConcept.prefLabel = { de: label }
        }
      }
      totalCount += 1
      if (totalCount % 500 === 0) {
        console.log(`- ${totalCount} (${loadedCount} loaded, ${cachedCount} cached, ${incompatibleCount} incompatible, ${failedCount} failed)`)
      }
    }
  }
  for (let uri of Object.keys(conceptsToLoad)) {
    const scheme = schemes.find(s => s.uri === uri)
    await loadConcepts(scheme)
  }
  console.log(`... loaded ${loadedCount} concepts from API.`)
  console.log(`... loaded ${cachedCount} concepts from cache.`)
  console.log(`... failed to load ${failedCount} concepts.`)
  console.log(`... ${incompatibleCount} concepts incompatible.`)
  incompatibleSchemes.length > 0 && console.log(`... ${incompatibleSchemes.length} incompatible vocabularies: ${incompatibleSchemes}`)

  // Prepare Typesense backend
  const collection = `${notation}-suggestions`
  if (!(await typesense.exists(collection))) {
    // Create collection
    await typesense.create(collection)
  }

  // Import into Typesense
  console.log("Importing data into Typesense backend...")
  let count = 0
  const chunkSize = 5000
  for (let i = 0; i < Object.values(conceptData).length; i += chunkSize) {
    const chunk = Object.values(conceptData).slice(i, i + chunkSize).map(mapConcept).filter(Boolean)
    await typesense.import(collection, chunk)
    count += chunk.length
    console.log(`... ${count} documents imported.`)
  }
  console.log("... import into Typesense complete.")
}
