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
  echo -e "${RED}❌ لطفا این اسکریپت را با دسترسی root اجرا کنید. (Please run as root)${NC}"
  exit 1
fi

# Print banner
print_banner() {
  clear
  echo -e "${CYAN}================================================================${NC}"
  echo -e "${CYAN}        🚀 VPN Config Customizer & Unlocker Telegram Bot 🚀      ${NC}"
  echo -e "${CYAN}               طراحی شده برای لینوکس (Debian/Ubuntu)            ${NC}"
  echo -e "${CYAN}================================================================${NC}"
  echo -e ""
}

# 1. INSTALLATION FUNCTION
install_bot() {
  print_banner
  echo -e "${YELLOW}🔄 شروع فرآیند نصب پیش‌نیازها و سرویس... (Starting Installation)${NC}"
  sleep 1

  # Update system package manager
  echo -e "${BLUE}📦 بروزرسانی مخازن لینوکس...${NC}"
  apt-get update -y && apt-get upgrade -y

  # Install essential tools
  echo -e "${BLUE}📦 در حال نصب curl, git, gnupg...${NC}"
  apt-get install -y curl git gnupg build-essential

  # Install Node.js (v22 LTS) if not present
  if ! command -v node &> /dev/null; then
    echo -e "${BLUE}🟢 در حال دریافت و نصب Node.js v22 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  else
    echo -e "${GREEN}✓ Node.js از قبل نصب شده است: $(node -v)${NC}"
  fi

  # Install PM2 globally to manage background execution
  if ! command -v pm2 &> /dev/null; then
    echo -e "${BLUE}🚀 در حال نصب مدیر پردازش PM2 به صورت سراسری...${NC}"
    npm install -g pm2
  else
    echo -e "${GREEN}✓ PM2 از قبل نصب شده است: $(pm2 -v)${NC}"
  fi

  # Choose directory to clone
  TARGET_DIR="/opt/vpn-customizer-bot"
  echo -e "${BLUE}📂 ایجاد دایرکتوری در آدرس: ${TARGET_DIR}${NC}"
  mkdir -p ${TARGET_DIR}

  # Clone repository
  if [ -d "${TARGET_DIR}/.git" ]; then
    echo -e "${YELLOW}⚠️ دایرکتوری از قبل حاوی یک مخزن گیت است. فایل‌ها آپدیت می‌شوند...${NC}"
    cd ${TARGET_DIR}
    git fetch --all
    git reset --hard origin/main
  else
    echo -e "${BLUE}📥 در حال کلون کردن مخزن گیت...${NC}"
    git clone https://github.com/meh732/Bottool.git ${TARGET_DIR}
    cd ${TARGET_DIR}
  fi

  # Ask for settings interactively to write .env
  echo -e ""
  echo -e "${CYAN}⚙️ تنظیمات متغیرهای محیطی (.env):${NC}"
  
  # Default Server App URL suggestion
  IP_ADDR=$(curl -s https://api.ipify.org || echo "YOUR_VPS_IP")
  DEFAULT_URL="https://${IP_ADDR}"
  
  read -p "❓ پورت مورد نظر جهت راه‌اندازی پنل وب (پیش‌فرض 3000): " USER_PORT
  if [ -z "$USER_PORT" ]; then
    USER_PORT="3000"
  fi

  read -p "❓ آدرس سرور شما (برای وب‌هوک تلگرام - پیش‌فرض http://${IP_ADDR}:${USER_PORT}): " USER_URL
  if [ -z "$USER_URL" ]; then
    USER_URL="http://${IP_ADDR}:${USER_PORT}"
  fi

  read -p "❓ نام کاربری مدیر جهت ورود به پنل (پیش‌فرض admin): " USER_ADMIN
  if [ -z "$USER_ADMIN" ]; then
    USER_ADMIN="admin"
  fi

  read -p "❓ رمز عبور مدیر جهت ورود به پنل (پیش‌فرض admin): " USER_PASS
  if [ -z "$USER_PASS" ]; then
    USER_PASS="admin"
  fi

  read -p "❓ رمز عبور رمزنگاری فایل‌های پشتیبان (پیش‌فرض BackupSecurePass123): " USER_BACKUP
  if [ -z "$USER_BACKUP" ]; then
    USER_BACKUP="BackupSecurePass123"
  fi

  # Create .env file
  echo -e "${BLUE}📝 ایجاد فایل تنظیمات .env...${NC}"
  cat <<EOF > .env
NODE_ENV=production
PORT=${USER_PORT}
APP_URL=${USER_URL}
ADMIN_USERNAME=${USER_ADMIN}
ADMIN_PASSWORD=${USER_PASS}
BACKUP_PASSWORD=${USER_BACKUP}
EOF

  echo -e "${GREEN}✓ فایل .env با موفقیت ذخیره شد.${NC}"

  # Open chosen port in firewall (ufw or iptables)
  echo -e "${BLUE}🛡️ بررسی و تنظیم فایروال سیستم...${NC}"
  if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    echo -e "${BLUE}🛡️ در حال باز کردن پورت ${USER_PORT} در فایروال (UFW)...${NC}"
    ufw allow ${USER_PORT}/tcp &> /dev/null || true
    ufw reload &> /dev/null || true
    echo -e "${GREEN}✓ پورت ${USER_PORT} با موفقیت در فایروال UFW باز شد.${NC}"
  elif command -v iptables &> /dev/null; then
    echo -e "${BLUE}🛡️ در حال باز کردن پورت ${USER_PORT} در iptables...${NC}"
    iptables -A INPUT -p tcp --dport ${USER_PORT} -j ACCEPT &> /dev/null || true
    echo -e "${GREEN}✓ پورت ${USER_PORT} با موفقیت در iptables مجاز شد.${NC}"
  fi

  # Warn about cloud provider firewalls
  echo -e "${YELLOW}⚠️ نکته بسیار مهم:${NC}"
  echo -e "اگر از سرورهای ابری (مانند Hetzner, AWS, GCP, DigitalOcean, Oracle) استفاده می‌کنید،"
  echo -e "حتماً پورت ${USER_PORT} را در پنل کاربری شرکت هاستینگ (Security Groups / Cloud Firewall) نیز باز کنید."
  echo -e ""

  # Install npm dependencies
  echo -e "${BLUE}📦 در حال نصب پکیج‌های پروژه (npm install)...${NC}"
  npm install

  # Build client and server bundling
  echo -e "${BLUE}⚙️ در حال کامپایل و بیلد نهایی پروژه (Production Build)...${NC}"
  npm run build

  # Check if build succeeded
  if [ ! -f "dist/server.cjs" ]; then
    echo -e "${RED}❌ خطایی در فرآیند بیلد رخ داد! خروجی dist/server.cjs یافت نشد.${NC}"
    exit 1
  fi

  # Start the application using PM2 with explicit working directory and env updates
  echo -e "${BLUE}🚀 راه‌اندازی ربات در پس‌زمینه با PM2...${NC}"
  pm2 delete vpn-customizer-bot &> /dev/null || true
  NODE_ENV=production pm2 start dist/server.cjs --name "vpn-customizer-bot" --cwd "/opt/vpn-customizer-bot" --update-env --env NODE_ENV=production
  pm2 save
  pm2 startup

  echo -e ""
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${GREEN}🎉 ربات با موفقیت نصب و راه‌اندازی شد!${NC}"
  echo -e "${CYAN}🖥 پنل تحت وب مدیریت در آدرس زیر در دسترس است:${NC}"
  echo -e "${YELLOW}👉 ${USER_URL}${NC}"
  echo -e "${BLUE}💡 برای کنترل لاگ‌های سیستم از دستور زیر استفاده کنید:${NC}"
  echo -e "${WHITE}👉 pm2 logs vpn-customizer-bot${NC}"
  echo -e "${GREEN}================================================================${NC}"
}

# 2. UPDATE FUNCTION
update_bot() {
  print_banner
  TARGET_DIR="/opt/vpn-customizer-bot"

  if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}❌ پوشه پروژه در مسیر ${TARGET_DIR} یافت نشد. لطفاً ابتدا گزینه 1 (نصب) را اجرا کنید.${NC}"
    exit 1
  fi

  echo -e "${YELLOW}🔄 شروع فرآیند آپدیت به آخرین نسخه گیت... (Updating Bot)${NC}"
  cd ${TARGET_DIR}

  # Pull from git
  echo -e "${BLUE}📥 دریافت آخرین فایل‌ها از مخزن... (git pull)${NC}"
  git fetch --all
  git reset --hard origin/main

  # Re-install clean packages
  echo -e "${BLUE}📦 بروزرسانی پکیج‌ها...${NC}"
  npm install

  # Re-build project
  echo -e "${BLUE}⚙️ کامپایل مجدد فایل‌ها...${NC}"
  npm run build

  # Restart PM2 process with environment updates and explicit working directory
  echo -e "${BLUE}🚀 راه‌اندازی مجدد در PM2...${NC}"
  pm2 restart vpn-customizer-bot --update-env &> /dev/null || pm2 start dist/server.cjs --name "vpn-customizer-bot" --cwd "/opt/vpn-customizer-bot" --update-env --env NODE_ENV=production

  echo -e ""
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${GREEN}✓ ربات با موفقیت به آخرین نسخه آپدیت و راه‌اندازی شد!${NC}"
  echo -e "${GREEN}================================================================${NC}"
}

# 3. UNINSTALL FUNCTION
uninstall_bot() {
  print_banner
  TARGET_DIR="/opt/vpn-customizer-bot"

  echo -e "${RED}⚠️ شما در حال حذف کامل ربات و توقف سرویس هستید!${NC}"
  read -p "❓ آیا مطمئن هستید؟ [y/N]: " CONFIRM
  if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🛑 توقف و حذف پروسه در PM2...${NC}"
    pm2 delete vpn-customizer-bot &> /dev/null || true
    pm2 save

    if [ -d "$TARGET_DIR" ]; then
      echo -e "${BLUE}🗑 حذف پوشه فایل‌های پروژه...${NC}"
      rm -rf "$TARGET_DIR"
    fi

    echo -e "${GREEN}✓ ربات با موفقیت کاملاً حذف شد.${NC}"
  else
    echo -e "${YELLOW}❌ عملیات حذف لغو شد.${NC}"
  fi
}

# Main Menu Selector Loop
while true; do
  print_banner
  echo -e "${CYAN}لطفاً یکی از گزینه‌های زیر را انتخاب کنید:${NC}"
  echo -e "  ${GREEN}1)${NC} نصب کامل ربات و پیش‌نیازها (Install)"
  echo -e "  ${YELLOW}2)${NC} آپدیت به آخرین نسخه گیت (Update)"
  echo -e "  ${RED}3)${NC} حذف کامل ربات و توقف پروسه (Uninstall)"
  echo -e "  ${BLUE}4)${NC} خروج (Exit)"
  echo -e ""
  read -p "👉 گزینه انتخابی شما [1-4]: " OPTION

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
      echo -e "${GREEN}خدا نگهدار! 👋${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ گزینه نامعتبر است! لطفاً عددی بین 1 تا 4 وارد کنید.${NC}"
      sleep 2
      ;;
  esac
done
