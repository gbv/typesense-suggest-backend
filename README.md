# typesense-suggest-backend
Experimental backend for mapping suggestions using Typesense, to be used in Cocoda Mapping Tool.

Currently not yet usable.

## Requirements

- Node.js 14 or later
- A running [Typesense](https://typesense.org) server
  - Access details need to be configured in `config/config.json`

## Setup

```bash
# Install dependencies
npm ci
# Copy and adjust default config
cp config/config.default.json config/config.json
editor config/config.json
# Run setup (currently defaults to Basisklassifikation as no other target is supported)
# Note: The first run will take a long time as a lot of data will have to be loaded from APIs. However, most data is cached, so subsequent runs will be much faster.
npm run setup
# Start the server (default port is 3021)
npm run start
```

## Usage

The service offers a [jskos-server](https://github.com/gbv/jskos-server) compatible `/search` endpoint. Currently supported query parameters: `voc` (vocabulary URI, required), `search` (search string, required), `limit` (optional), `offset` (optional)

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
