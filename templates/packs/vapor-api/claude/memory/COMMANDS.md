# {{PROJECT_NAME}} — Commands

> Only commands proven to work in THIS project, with exact flags.

## Build & test (fast loop — always first)
swift build
swift test
swift test --filter AppTests        # one suite

## Run locally
cp env_dist .env                    # once — then fill values (never commit .env)
docker run -d --name {{PROJECT_NAME}}-db -p 5432:5432 \
  -e POSTGRES_USER=vapor_username -e POSTGRES_PASSWORD=vapor_password \
  -e POSTGRES_DB=vapor_database postgres:16-alpine
swift run App serve --hostname 127.0.0.1 --port 8080
swift run App serve --log debug     # one-off verbosity bump
curl -s localhost:8080/health       # liveness proof

## Database
swift run App migrate               # run pending migrations manually
swift run App migrate --revert      # revert the last batch

## Quality gates (before any ship)
bash scripts/validate-env-vars.sh   # AppConfig.Key ↔ env_dist ↔ manifests
bash scripts/generate-error-codes.sh   # regenerate docs/ERROR_CODES.md from Failed.swift
docker run --rm -v "$PWD:/src" -w /src swift:6.2-noble swift test   # Linux gate

## Docker image
docker build -t {{BUNDLE_ID}} .
docker run --rm -p 8080:8080 --env-file .env {{BUNDLE_ID}}
