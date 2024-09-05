FROM node:20-alpine

WORKDIR /usr/src/app

# Install git
RUN apk add --update git

# Copy and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 3021

# Use pm2 to run app
RUN npm install pm2 -g

RUN mkdir /config
RUN mkdir /cache

COPY .docker/docker-entrypoint.sh /usr/local/bin/

# Override default config
COPY .docker/config.default.json config/config.default.json

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["%%CMD%%"]
