# ---- build the client
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: production dependencies, the server sources and the built client only
FROM node:24-alpine
RUN apk add --no-cache tini && mkdir -p /data && chown node:node /data
WORKDIR /app
ENV NODE_ENV=production PORT=3000 ZGAME_SAVE=/data/world.json
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node tsconfig.json ./
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# tini forwards SIGTERM so the server can write a final save before the container stops
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "server/index.ts"]
