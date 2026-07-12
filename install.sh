#!/bin/bash

# ==============================================================================
#  VPN Config Customizer Bot - Linux Installer & Updater Script
#  Compatible with Debian/Ubuntu Linux Server
#  Repository: https://github.com/meh732/Bottool.git
# ==============================================================================

# Colors for elegant terminal outputs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Please run this script with root privileges.${NC}"
  exit 1
fi

# Print banner
print_banner() {
  clear
  echo -e "${CYAN}================================================================${NC}"
  echo -e "${CYAN}        🚀 VPN Config Customizer & Unlocker Telegram Bot 🚀      ${NC}"
  echo -e "${CYAN}                Designed for Linux (Debian/Ubuntu)               ${NC}"
  echo -e "${CYAN}================================================================${NC}"
  echo -e ""
}

# 1. INSTALLATION FUNCTION
install_bot() {
  print_banner
  echo -e "${YELLOW}🔄 Starting installation of dependencies and service...${NC}"
  sleep 1

  # Update system package manager
  echo -e "${BLUE}📦 Updating Linux repositories...${NC}"
  apt-get update -y && apt-get upgrade -y

  # Install essential tools
  echo -e "${BLUE}📦 Installing curl, git, gnupg...${NC}"
  apt-get install -y curl git gnupg build-essential

  # Install Node.js (v22 LTS) if not present
  if ! command -v node &> /dev/null; then
    echo -e "${BLUE}🟢 Downloading and installing Node.js v22 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  else
    echo -e "${GREEN}✓ Node.js is already installed: $(node -v)${NC}"
  fi

  # Install PM2 globally to manage background execution
  if ! command -v pm2 &> /dev/null; then
    echo -e "${BLUE}🚀 Installing PM2 process manager globally...${NC}"
    npm install -g pm2
  else
    echo -e "${GREEN}✓ PM2 is already installed: $(pm2 -v)${NC}"
  fi

  # Choose directory to clone
  TARGET_DIR="/opt/vpn-customizer-bot"
  echo -e "${BLUE}📂 Creating directory at: ${TARGET_DIR}${NC}"
  mkdir -p ${TARGET_DIR}

  # Clone repository
  if [ -d "${TARGET_DIR}/.git" ]; then
    echo -e "${YELLOW}⚠️ Directory already contains a git repository. Updating files...${NC}"
    cd ${TARGET_DIR}
    git fetch --all
    git reset --hard origin/main
  else
    echo -e "${BLUE}📥 Cloning git repository...${NC}"
    git clone https://github.com/meh732/Bottool.git ${TARGET_DIR}
    cd ${TARGET_DIR}
  fi

  # Ask for settings interactively to write .env
  echo -e ""
  echo -e "${CYAN}⚙️ Environment Variables Configuration (.env):${NC}"
  
  # Default Server App URL suggestion
  IP_ADDR=$(curl -s https://api.ipify.org || echo "YOUR_VPS_IP")
  DEFAULT_URL="https://${IP_ADDR}"
  
  read -p "❓ Web panel port (default 3000): " USER_PORT
  if [ -z "$USER_PORT" ]; then
    USER_PORT="3000"
  fi

  read -p "❓ Your server URL (for Telegram webhook - default http://${IP_ADDR}:${USER_PORT}): " USER_URL
  if [ -z "$USER_URL" ]; then
    USER_URL="http://${IP_ADDR}:${USER_PORT}"
  fi

  read -p "❓ Admin username for web panel (default admin): " USER_ADMIN
  if [ -z "$USER_ADMIN" ]; then
    USER_ADMIN="admin"
  fi

  read -p "❓ Admin password for web panel (default admin): " USER_PASS
  if [ -z "$USER_PASS" ]; then
    USER_PASS="admin"
  fi

  read -p "❓ Encryption password for backup files (default BackupSecurePass123): " USER_BACKUP
  if [ -z "$USER_BACKUP" ]; then
    USER_BACKUP="BackupSecurePass123"
  fi

  # Create .env file
  echo -e "${BLUE}📝 Creating .env configuration file...${NC}"
  cat <<EOF > .env
NODE_ENV=production
PORT=${USER_PORT}
APP_URL=${USER_URL}
ADMIN_USERNAME=${USER_ADMIN}
ADMIN_PASSWORD=${USER_PASS}
BACKUP_PASSWORD=${USER_BACKUP}
EOF

  echo -e "${GREEN}✓ .env file saved successfully.${NC}"

  # Open chosen port in firewall (ufw or iptables)
  echo -e "${BLUE}🛡️ Checking and configuring system firewall...${NC}"
  if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    echo -e "${BLUE}🛡️ Opening port ${USER_PORT} in firewall (UFW)...${NC}"
    ufw allow ${USER_PORT}/tcp &> /dev/null || true
    ufw reload &> /dev/null || true
    echo -e "${GREEN}✓ Port ${USER_PORT} opened successfully in UFW firewall.${NC}"
  elif command -v iptables &> /dev/null; then
    echo -e "${BLUE}🛡️ Opening port ${USER_PORT} in iptables...${NC}"
    iptables -A INPUT -p tcp --dport ${USER_PORT} -j ACCEPT &> /dev/null || true
    echo -e "${GREEN}✓ Port ${USER_PORT} allowed successfully in iptables.${NC}"
  fi

  # Warn about cloud provider firewalls
  echo -e "${YELLOW}⚠️ Important Note:${NC}"
  echo -e "If you are using cloud servers (like Hetzner, AWS, GCP, DigitalOcean, Oracle),"
  echo -e "make sure to also open port ${USER_PORT} in your hosting provider's panel (Security Groups / Cloud Firewall)."
  echo -e ""

  # Install npm dependencies
  echo -e "${BLUE}📦 Installing project packages (npm install)...${NC}"
  npm install

  # Build client and server bundling
  echo -e "${BLUE}⚙️ Compiling and creating production build...${NC}"
  npm run build

  # Check if build succeeded
  if [ ! -f "dist/server.cjs" ]; then
    echo -e "${RED}❌ An error occurred during the build process! Output dist/server.cjs not found.${NC}"
    exit 1
  fi

  # Export variables to shell so PM2 inherits them securely
  export NODE_ENV=production
  export APP_PORT=${USER_PORT}
  export APP_URL=${USER_URL}
  export ADMIN_USERNAME=${USER_ADMIN}
  export ADMIN_PASSWORD=${USER_PASS}
  export BACKUP_PASSWORD=${USER_BACKUP}

  # Start the application using PM2 with explicit working directory and env updates
  echo -e "${BLUE}🚀 Starting bot in background with PM2...${NC}"
  pm2 delete vpn-customizer-bot &> /dev/null || true
  pm2 start "${TARGET_DIR}/dist/server.cjs" --name "vpn-customizer-bot" --cwd "${TARGET_DIR}" --update-env
  pm2 save
  pm2 startup

  echo -e ""
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${GREEN}🎉 Bot installed and started successfully!${NC}"
  echo -e "${CYAN}🖥 Web management panel is accessible at:${NC}"
  echo -e "${YELLOW}👉 ${USER_URL}${NC}"
  echo -e "${BLUE}💡 Use the following command to check system logs:${NC}"
  echo -e "${NC}👉 pm2 logs vpn-customizer-bot${NC}"
  echo -e "${GREEN}================================================================${NC}"
}

# 2. UPDATE FUNCTION
update_bot() {
  print_banner
  TARGET_DIR="/opt/vpn-customizer-bot"

  if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}❌ Project folder not found at ${TARGET_DIR}. Please run option 1 (Install) first.${NC}"
    exit 1
  fi

  echo -e "${YELLOW}🔄 Starting update process to latest git version...${NC}"
  cd ${TARGET_DIR}

  # Pull from git
  echo -e "${BLUE}📥 Fetching latest files from repository... (git pull)${NC}"
  git fetch --all
  git reset --hard origin/main

  # Re-install clean packages
  echo -e "${BLUE}📦 Updating packages...${NC}"
  npm install

  # Re-build project
  echo -e "${BLUE}⚙️ Recompiling files...${NC}"
  npm run build

  # Load and export existing .env variables if present so PM2 inherits/updates them
  if [ -f ".env" ]; then
    echo -e "${BLUE}⚙️ Loading and reloading port and user settings from .env...${NC}"
    set -a
    source .env
    set +a
  fi

  # Restart PM2 process with environment updates and explicit working directory
  echo -e "${BLUE}🚀 Restarting in PM2...${NC}"
  pm2 restart vpn-customizer-bot --update-env &> /dev/null || pm2 start "${TARGET_DIR}/dist/server.cjs" --name "vpn-customizer-bot" --cwd "${TARGET_DIR}" --update-env

  echo -e ""
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${GREEN}✓ Bot successfully updated to the latest version and started!${NC}"
  echo -e "${GREEN}================================================================${NC}"
}

# 3. UNINSTALL FUNCTION
uninstall_bot() {
  print_banner
  TARGET_DIR="/opt/vpn-customizer-bot"

  echo -e "${RED}⚠️ You are about to completely remove the bot and stop the service!${NC}"
  read -p "❓ Are you sure? [y/N]: " CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🛑 Stopping and removing PM2 process...${NC}"
    pm2 delete vpn-customizer-bot &> /dev/null || true
    pm2 save

    if [ -d "$TARGET_DIR" ]; then
      echo -e "${BLUE}🗑 Deleting project files folder...${NC}"
      rm -rf "$TARGET_DIR"
    fi

    echo -e "${GREEN}✓ Bot successfully and completely removed.${NC}"
  else
    echo -e "${YELLOW}❌ Uninstallation cancelled.${NC}"
  fi
}

# Main Menu Selector Loop
while true; do
  print_banner
  echo -e "${CYAN}Please select one of the following options:${NC}"
  echo -e "  ${GREEN}1)${NC} Full Install of bot and dependencies"
  echo -e "  ${YELLOW}2)${NC} Update to latest git version"
  echo -e "  ${RED}3)${NC} Uninstall completely"
  echo -e "  ${BLUE}4)${NC} Exit"
  echo -e ""
  read -p "👉 Your choice [1-4]: " OPTION

  case $OPTION in
    1)
      install_bot
      break
      ;;
    2)
      update_bot
      break
      ;;
    3)
      uninstall_bot
      break
      ;;
    4)
      echo -e "${GREEN}Goodbye! 👋${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Invalid option! Please enter a number between 1 and 4.${NC}"
      sleep 2
      ;;
  esac
done
