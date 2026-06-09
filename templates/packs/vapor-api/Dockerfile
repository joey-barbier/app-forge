# ================================
# Build image
# ================================
FROM swift:6.2-noble AS build

# OS updates + jemalloc headers (server-grade allocator, linked below)
RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q dist-upgrade -y \
    && apt-get install -y libjemalloc-dev

WORKDIR /build

# Resolve dependencies first: this layer is cached and reused as long as
# Package.swift / Package.resolved do not change.
COPY ./Package.* ./
RUN if [ -f ./Package.resolved ]; then \
        swift package resolve --force-resolved-versions; \
    else \
        swift package resolve; \
    fi

COPY . .

# Release build: static Swift stdlib (no runtime needed in the run image) + jemalloc
# (measurably lower fragmentation under sustained load than glibc malloc).
# N.B.: the STATIC jemalloc is incompatible with the static Swift runtime — link dynamic.
RUN swift build -c release \
                --static-swift-stdlib \
                -Xlinker -ljemalloc

WORKDIR /staging

# Main executable
RUN cp "$(swift build --package-path /build -c release --show-bin-path)/App" ./

# Static backtracer: readable crash reports in production containers.
RUN cp "/usr/libexec/swift/linux/swift-backtrace-static" ./

# Resources bundled by SPM
RUN find -L "$(swift build --package-path /build -c release --show-bin-path)/" -regex '.*\.resources$' -exec cp -Ra {} ./ \;

# Public/Resources directories if present — read-only by default.
RUN [ -d /build/Public ] && { mv /build/Public ./Public && chmod -R a-w ./Public; } || true
RUN [ -d /build/Resources ] && { mv /build/Resources ./Resources && chmod -R a-w ./Resources; } || true

# ================================
# Run image
# ================================
FROM ubuntu:noble

RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q dist-upgrade -y \
    && apt-get -q install -y \
      libjemalloc2 \
      ca-certificates \
      tzdata \
    && rm -r /var/lib/apt/lists/*

# Non-root user — the API never runs as root.
RUN useradd --user-group --create-home --system --skel /dev/null --home-dir /app vapor

WORKDIR /app

COPY --from=build --chown=vapor:vapor /staging /app

# Crash reporter configuration (pairs with the static backtracer above).
ENV SWIFT_BACKTRACE=enable=yes,sanitize=yes,threads=all,images=all,interactive=no,swift-backtrace=./swift-backtrace-static

# Log level is RUNTIME configuration — overridable at `docker run`, never hardcoded.
ARG LOG_LEVEL=info
ENV LOG_LEVEL=${LOG_LEVEL}

USER vapor:vapor

EXPOSE 8080

ENTRYPOINT ["./App"]
CMD ["serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "8080"]
