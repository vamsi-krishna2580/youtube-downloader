FROM node:20-slim

# ---- System deps ----
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    curl \
 && rm -rf /var/lib/apt/lists/*

# ---- Install latest yt-dlp official binary ----
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

# ---- App ----
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
