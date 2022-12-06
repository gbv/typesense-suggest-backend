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

main()
async function main() {
  // Init all registries
  console.log("Initialize all registries...")
  await Promise.all(mappingRegistries.concat(bartocRegistry).map(registry => registry.init()))
  console.log("... all registries initialized.")

  const scheme = (await bartocRegistry.getSchemes({ params: { uri } }))[0]
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
        concept.mappings = (concept.mappings ?? []).concat(otherConcepts)
      })
    }
    console.log(`... mapping data loaded (${count} mappings, ${index}).`)
  }))

  console.log(conceptData["http://uri.gbv.de/terminology/bk/18.91"])
}
