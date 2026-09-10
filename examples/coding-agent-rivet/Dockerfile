FROM oven/bun:1.4.0

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile \
  && bun run --cwd packages/generalist build \
  && bun run --cwd examples/coding-agent-rivet typecheck

CMD ["bun", "--cwd", "examples/coding-agent-rivet", "start"]
