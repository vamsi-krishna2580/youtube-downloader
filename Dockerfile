# ---- Base image ----
FROM node:20-slim

# ---- Install system dependencies ----
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    curl \
 && rm -rf /var/lib/apt/lists/*

# ---- Install latest yt-dlp (official binary) ----
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

# ---- App directory ----
WORKDIR /app

# ---- Install Node dependencies ----
COPY package*.json ./
RUN npm install --omit=dev

# ---- Copy application source ----
COPY . .

# ---- Copy YouTube cookies (IMPORTANT) ----
COPY cookies.txt /cookies.txt

# ---- Expose port ----
EXPOSE 3000

# ---- Start server ----
CMD ["node", "index.js"]
