# DayZ Server Docker Image
# Supports SteamCMD with anonymous or authenticated login (including Steam Guard)

FROM debian:bookworm-slim

LABEL maintainer="DayZ Server Manager"
LABEL description="DayZ Dedicated Server with mod support"

# Install dependencies
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        lib32gcc-s1 \
        lib32stdc++6 \
        libsdl2-2.0-0:i386 \
        libcurl4:i386 \
        locales \
        nodejs \
        npm \
        procps \
        && \
    # Clean up
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set up locale
RUN sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Create steam user
RUN useradd -m -s /bin/bash steam && \
    mkdir -p /opt/steamcmd /opt/dayz-server /config && \
    chown -R steam:steam /opt/steamcmd /opt/dayz-server /config

# Install Node.js LTS
RUN npm install -g n && n lts && \
    npm cache clean --force

# Copy application files
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

# Create symlink for CLI
RUN npm link

# Set up volumes
VOLUME ["/opt/steamcmd", "/opt/dayz-server", "/config"]

# Expose ports
# 2302 - Game port
# 2303 - Steam query (game port + 1)
# 2304 - Steam master (game port + 2)
EXPOSE 2302/udp 2303/udp 2304/udp

# Switch to steam user
USER steam

# Set working directory
WORKDIR /opt/dayz-server

# Environment variables
ENV DAYZ_CONFIG=/config/dayz-config.yaml
ENV STEAM_USERNAME=""
ENV STEAM_PASSWORD=""
ENV STEAM_GUARD_CODE=""

# Use Node.js entrypoint directly
ENTRYPOINT ["node", "/app/dist/entrypoint.js"]
CMD ["start"]

