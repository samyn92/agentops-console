# AgentOps Console — Go BFF + SolidJS PWA
# Multi-stage build: Node.js for frontend, Go for backend

# ── Stage 1: Build frontend ──
FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Build Go backend ──
FROM golang:1.26-alpine AS backend
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN go mod edit -dropreplace github.com/samyn92/agentops-core && go mod tidy && go mod download
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} go build -ldflags="-s -w" -o console ./cmd/console/

# ── Stage 3: Final image ──
FROM alpine:3.21
RUN apk add --no-cache ca-certificates \
    && adduser -D -u 1000 console
COPY --from=backend /app/console /app/console
COPY --from=frontend /app/web/dist /app/web/dist

USER 1000:1000

ENTRYPOINT ["/app/console"]
CMD ["--addr=:8080", "--web-dir=/app/web/dist"]
