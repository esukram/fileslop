# Fileslop server. No runtime dependencies: Node runs the TypeScript sources directly.
# No RUN steps, so that the image builds for each platform without emulation.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

# The server reads its config file from /config/fileslop/.env. Mount the file there.
ENV NODE_ENV=production \
    XDG_CONFIG_HOME=/config \
    FILESLOP_HOST=0.0.0.0 \
    FILESLOP_PORT=8080 \
    FILESLOP_DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY src ./src

USER node
# BuildKit creates the directory for the current user.
WORKDIR /data
VOLUME /data
WORKDIR /app

EXPOSE 8080
ENTRYPOINT ["node", "src/main.ts"]
CMD ["serve"]
