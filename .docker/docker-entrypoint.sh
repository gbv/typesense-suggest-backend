#!/bin/sh

# Create default config.json if necessary
if [ ! -f /config/config.json ]; then
  echo '{}' > /config/config.json
fi

CONFIG_FILE=/config/config.json pm2-runtime server.js
