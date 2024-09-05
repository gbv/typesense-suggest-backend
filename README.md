# typesense-suggest-backend
Experimental backend for mapping suggestions using Typesense, to be used in Cocoda Mapping Tool.

Currently not yet stable.

## Requirements

- Node.js 20 or later
- A running [Typesense](https://typesense.org) server (v27)
  - Access details need to be configured in `config/config.json`

## Setup

```bash
# Install dependencies
npm ci
# Copy and adjust default config
cp config/config.default.json config/config.json
editor config/config.json
# Run setup for each vocabulary (currently, only RVK and BK are supported)
# Note: The first run will take a long time as a lot of data will have to be loaded from APIs. However, most data is cached, so subsequent runs will be much faster.
# BK
npm run setup "http://bartoc.org/en/node/18785"
# BK
npm run setup "http://bartoc.org/en/node/533"
# Start the server (default port is 3021)
npm run start
```

## Usage

The service offers a [jskos-server](https://github.com/gbv/jskos-server) compatible `/search` endpoint. Currently supported query parameters: `voc` (vocabulary URI, required), `search` (search string, required), `limit` (optional), `offset` (optional)

In Cocoda, it can be included as a suggestion registry like this (example for RVK and BK):

```json
{
  "provider": "LabelSearchSuggestion",
  "uri": "http://coli-conc.gbv.de/registry/coli-conc-recommendations-experimental-local",
  "schemes": [
    {
      "uri": "http://bartoc.org/en/node/533"
    },
    {
      "uri": "http://bartoc.org/en/node/18785"
    }
  ],
  "overrides": [
    {
      "uri": "http://bartoc.org/en/node/533",
      "identifier": [
        "http://uri.gbv.de/terminology/rvk/"
      ],
      "search": "http://localhost:3021/search"
    },
    {
      "uri": "http://bartoc.org/en/node/18785",
      "identifier": [
        "http://uri.gbv.de/terminology/bk/"
      ],
      "search": "http://localhost:3021/search"
    }
  ],
  "notation": [
    "CRe"
  ],
  "prefLabel": {
    "en": "coli-conc Suggestions (experimental, local)",
    "de": "coli-conc Vorschläge (experimentell, lokal)"
  }
}
```

## To-Dos

### Include Wikidata Mappings

Wikidata mappings could be included, but we need to implement the `download` parameter in [wikidata-jskos](https://github.com/gbv/wikidata-jskos) ([#75](https://github.com/gbv/wikidata-jskos/issues/75)) before we can integrate it here. As soon as that is implemented, all this to the config's `mappingRegistries`:

```json
{
  "provider": "MappingsApi",
  "uri": "http://coli-conc.gbv.de/registry/wikidata-mappings",
  "status": "https://coli-conc.gbv.de/services/wikidata/status"
}
```
