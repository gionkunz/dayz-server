# DayZ Server Docker

A Docker-based DayZ dedicated server with SteamCMD support, mod management, and a TypeScript CLI tool for configuration.

## Features

- 🐳 **Docker containerized** - Easy deployment and management
- 🔐 **Steam authentication** - Supports anonymous, username/password, and Steam Guard
- 📦 **Mod support** - Install and manage Steam Workshop mods
- ⚙️ **Mod configuration** - Built-in configurators for popular mods (VPP Admin Tools, etc.)
- 🛠️ **CLI tool** - TypeScript-based management tool
- 📝 **YAML configuration** - Single configuration file for all settings

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
cd dayz-server

# Copy example configuration
cp config/dayz-config.yaml.example config/dayz-config.yaml
cp env.example .env
```

### 2. Configure

Edit `config/dayz-config.yaml` with your server settings:

```yaml
server:
  name: "My DayZ Server"
  adminPassword: "your_admin_password"
  maxPlayers: 60

mods:
  - workshopId: "1559212036"
    name: "@CF"
    clientRequired: true
    serverSide: false

modConfigs:
  vppAdminTools:
    superAdmins:
      - "76561198000000000"  # Your Steam64 ID
```

Set Steam credentials in your `.env` file:

```bash
STEAM_USERNAME=your_steam_username
STEAM_PASSWORD=your_steam_password
```

### 3. Build and Run

```bash
# Build the Docker image
docker-compose build

# Start the server
docker-compose up -d
```

### 4. Steam Guard Authentication

If using a Steam account with Steam Guard enabled:

1. First run will fail and request a Steam Guard code
2. Check your email for the code
3. Add the code to your `.env` file:
   ```
   STEAM_GUARD_CODE=XXXXX
   ```
4. Restart the container:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STEAM_USERNAME` | Steam account username | (empty - anonymous) |
| `STEAM_PASSWORD` | Steam account password | (empty) |
| `STEAM_GUARD_CODE` | Steam Guard code from email | (empty) |
| `DAYZ_CONFIG` | Path to config file | `/config/dayz-config.yaml` |

### Configuration File

The main configuration file (`config/dayz-config.yaml`) contains server settings and mod configurations.

**Note:** Steam credentials are set via environment variables only (see above).

#### Server Section
```yaml
server:
  name: "My DayZ Server"
  password: ""              # Server password (empty = no password)
  adminPassword: "changeme"
  maxPlayers: 60
  port: 2302
  battleEye: true
  persistent: true
  mission: "dayzOffline.chernarusplus"
```

#### Mods Section
```yaml
mods:
  - workshopId: "1559212036"
    name: "@CF"
    clientRequired: true
    serverSide: false
```

#### Mod Configurations
```yaml
modConfigs:
  vppAdminTools:
    superAdmins:
      - "76561198000000000"
    password: "adminpassword"
    disablePassword: false
```

## CLI Commands

The container includes a CLI tool (`dayz-manager`) for server management:

```bash
# Enter the container
docker exec -it dayz-server bash

# Available commands
dayz-manager init              # Create initial configuration
dayz-manager validate          # Validate configuration
dayz-manager install           # Full installation
dayz-manager install-steamcmd  # Install SteamCMD only
dayz-manager install-server    # Install/update DayZ server
dayz-manager install-mods      # Install/update mods
dayz-manager configure-mods    # Configure installed mods
dayz-manager generate-config   # Generate server config files
dayz-manager start             # Start the server
```

## Docker Commands

```bash
# Build image
docker-compose build

# Start server
docker-compose up -d

# View logs
docker-compose logs -f

# Stop server
docker-compose down

# Restart server
docker-compose restart

# Enter container shell
docker exec -it dayz-server bash

# Update server and mods
docker exec -it dayz-server node /app/dist/entrypoint.js update
```

## Mod Support

### Installing Mods

Add mods to your configuration file:

```yaml
mods:
  # CF (Community Framework) - Required by many mods
  - workshopId: "1559212036"
    name: "@CF"
    clientRequired: true
    serverSide: false

  # VPP Admin Tools
  - workshopId: "1708571776"
    name: "@VPPAdminTools"
    clientRequired: true
    serverSide: false
```

### Supported Mod Configurators

The CLI includes built-in configurators for:

- **VPP Admin Tools** (`@VPPAdminTools`)
  - Automatic SuperAdmins.txt generation
  - Password hashing for credentials.txt
  - serverDZ.cfg integration

To add support for more mods, create a configurator in `src/mods/configurators/`.

### VPP Admin Tools Configuration

Based on the [official documentation](https://github.com/VanillaPlusPlus/VPP-Admin-Tools/wiki/Installation-&-Configuration):

```yaml
modConfigs:
  vppAdminTools:
    superAdmins:
      - "76561198000000000"  # Your Steam64 ID
    password: "your_admin_password"
    disablePassword: false  # Set to true to skip password
```

Find your Steam64 ID at [steamid.io](https://steamid.io/).

## Volumes

| Volume | Path | Description |
|--------|------|-------------|
| `steamcmd-data` | `/opt/steamcmd` | SteamCMD installation |
| `dayz-server-data` | `/opt/dayz-server` | DayZ server files |
| `./config` | `/config` | Configuration files |

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 2302 | UDP | Game port |
| 2303 | UDP | Steam query (game port + 1) |
| 2304 | UDP | Steam master (game port + 2) |
| 27016 | UDP | Steam query port |

## Troubleshooting

### Steam Guard Code Required

If you see "Steam Guard code required":

1. Check your email for the code
2. Add it to `.env` or `dayz-config.yaml`
3. Restart the container

### Mods Not Downloading

- Make sure your Steam account owns DayZ (required for Workshop downloads)
- Anonymous login only works for the base server, not mods
- Check Steam credentials are correct

### Server Not Starting

1. Check logs: `docker-compose logs -f`
2. Validate config: `docker exec -it dayz-server dayz-manager validate`
3. Ensure all required mods are installed

### Permission Issues

The container runs as UID 1000 (steam user). If you have permission issues with mounted volumes:

```bash
sudo chown -R 1000:1000 ./config
```

## Development

### Building the CLI Tool

```bash
npm install
npm run build
```

### Adding a New Mod Configurator

1. Create a new file in `src/mods/configurators/`
2. Extend the `ModConfigurator` base class
3. Register it in `src/mods/manager.ts`

Example:

```typescript
import { ModConfigurator } from './base';

export class MyModConfigurator extends ModConfigurator {
  get modName(): string {
    return '@MyMod';
  }

  configure(): void {
    // Configuration logic here
  }
}
```

## License

MIT

