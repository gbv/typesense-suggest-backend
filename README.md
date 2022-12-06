# typesense-suggest-backend
Experimental backend for mapping suggestions using Typesense, to be used in Cocoda Mapping Tool.

Currently not yet usable.

## Setup

```bash
# Install dependencies
npm ci
# Copy and adjust default config
cp config/config.default.json config/config.json
editor config/config.json
# Run script
node index.js
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
