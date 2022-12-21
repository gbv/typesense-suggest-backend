TODO

```bash
mkdir -p data/{config,typesense,cache}
docker compose up -d
docker compose exec -e CONFIG_FILE=/config/config.json typesense-suggest npm run setup
```

<!-- https://technotrampoline.com/articles/how-to-run-a-local-typesense-server-with-docker-compose/ -->
