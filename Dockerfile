FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=3000 OGAME_SAVE=/data/world.json
VOLUME /data
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
