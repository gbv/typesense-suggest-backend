TODO

```yml
services:
  typesense-suggest:
    image: ghcr.io/gbv/typesense-suggest-backend:latest
    depends_on:
      - typesense
    volumes:
      - ./data/config:/config
      - ./data/cache:/cache
    ports:
      - 3021:3021
    restart: unless-stopped

  typesense:
    image: typesense/typesense:27
    entrypoint: sh -c "/opt/typesense-server --data-dir /data --api-key=xyz"
    volumes:
      - ./data/typesense:/data
    restart: unless-stopped
```

```bash
mkdir -p data/{config,typesense,cache}
docker compose up -d
docker compose exec -e CONFIG_FILE=/config/config.json typesense-suggest npm run setup "<uri>"
```

<!-- https://technotrampoline.com/articles/how-to-run-a-local-typesense-server-with-docker-compose/ -->
