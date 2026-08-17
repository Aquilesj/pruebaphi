FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

# 3000: interno (la app escucha aquí, red interna de compose)
# 443: externo (HTTPS lo termina Caddy, servicio "caddy" con perfil production)
EXPOSE 3000 443

CMD ["node", "server.js"]
