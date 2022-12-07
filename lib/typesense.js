import config from "../config/index.js"
import Typesense from "typesense"

const client = new Typesense.Client(config.typesense)

const fields = [
  { name: "identifier", type: "string[]", infix: false, typos: 0, weight: 127 },
  { name: "prefLabel", type: "string[]", infix: true, typos: 2, weight: 120 },
  { name: "altLabel", type: "string[]", infix: true, typos: 1, weight: 80 },
  { name: "mappingLabelsExactClose", type: "string[]", infix: false, typos: 0, weight: 80 },
  { name: "mappingLabelsNarrowBroad", type: "string[]", infix: false, typos: 0, weight: 60 },
  { name: "mappingLabelsOther", type: "string[]", infix: false, typos: 0, weight: 10 },
  { name: "notes", type: "string[]", infix: false, typos: 0, weight: 50 },
]

const schema = {
  fields: fields.map(({ name, type, infix }) => ({ name, type, infix })),
}

const typesense = {
  async exists(collection) {
    const collections = await client.collections().retrieve()
    return !!collections.find(c => c.name === collection)
  },
  async create(collection) {
    return await client.collections().create({ name: collection, ...schema })
  },
  async delete(collection) {
    return await client.collections(collection).delete()
  },
  async import(collection, documents) {
    return await client.collections(collection).documents().import(documents, { action: "upsert" })
  },
  async search(collection, query, _fields, options = {}) {
    _fields = !_fields ? fields : fields.filter(f => _fields.includes(f.name))
    return await client.collections(collection).documents().search({
      q: query,
      query_by: _fields.map(f => f.name).join(","),
      num_typos: _fields.map(f => f.typos).join(","),
      query_by_weights: _fields.map(f => f.weight).join(","),
      // prioritize_exact_match: false,
      infix: "always",
      per_page: 100,
      exhaustive_search: true,
      ...options,
    })
  },
}
export default typesense
