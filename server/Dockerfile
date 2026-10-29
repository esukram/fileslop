# Fileslop server. Zero runtime dependencies: Node runs the TypeScript sources directly.
FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

ENV NODE_ENV=production \
    FILESLOP_HOST=0.0.0.0 \
    FILESLOP_PORT=8080 \
    FILESLOP_DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir /data && chown node:node /data

USER node
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["node", "src/main.ts"]
CMD ["serve"]
