FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# No inbound port: this process dials OUT to a XiaoZhi MCP endpoint
# (MCP_ENDPOINT) over WebSocket, or speaks MCP over stdio.
CMD ["node", "dist/index.js"]
