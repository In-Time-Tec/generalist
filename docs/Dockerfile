FROM oven/bun:1.4.0 AS build

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY . .

RUN bun install --frozen-lockfile --ignore-scripts && bun run --cwd docs build

FROM build AS runtime-dependencies

RUN rm -rf node_modules docs/node_modules \
  && bun install --frozen-lockfile --production --ignore-scripts --filter @generalist/docs

FROM oven/bun:1.4.0

WORKDIR /app/docs

ENV NODE_ENV=production

COPY --from=runtime-dependencies /app/node_modules /app/node_modules
COPY --from=runtime-dependencies /app/docs/node_modules ./node_modules
COPY --from=build /app/docs/package.json ./package.json
COPY --from=build /app/docs/dist ./dist
COPY --from=build /app/docs/server ./server

EXPOSE 3000

CMD ["bun", "server/main.ts"]
