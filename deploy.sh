#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Instala o DevOps Dashboard em uma VPS Ubuntu 22.04 virgem
# Uso: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     DevOps Dashboard — Instalação Automática ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Coleta de informações ──────────────────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Nome do projeto (ex: acme-dashboard):${NC} ")" PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-devops-dashboard}

read -rp "$(echo -e "${YELLOW}IP ou domínio do servidor (ex: 200.10.20.30 ou dashboard.empresa.com):${NC} ")" SERVER_HOST
[ -z "$SERVER_HOST" ] && error "IP/domínio obrigatório"

read -rp "$(echo -e "${YELLOW}Azure DevOps — Organização (ex: minhaempresa):${NC} ")" AZURE_ORG
[ -z "$AZURE_ORG" ] && error "Organização Azure obrigatória"

read -rp "$(echo -e "${YELLOW}Azure DevOps — Projeto (ex: USE):${NC} ")" AZURE_PROJECT
[ -z "$AZURE_PROJECT" ] && error "Projeto Azure obrigatório"

read -rsp "$(echo -e "${YELLOW}Azure DevOps — Personal Access Token (PAT):${NC} ")" AZURE_PAT; echo
[ -z "$AZURE_PAT" ] && error "PAT obrigatório"

read -rsp "$(echo -e "${YELLOW}Senha do admin do dashboard:${NC} ")" ADMIN_PASSWORD; echo
ADMIN_PASSWORD=${ADMIN_PASSWORD:-Admin@$(date +%Y)!}

read -rp "$(echo -e "${YELLOW}Porta do backend (padrão: 3001):${NC} ")" BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-3001}

PROTOCOL="http"
if [[ "$SERVER_HOST" != *"."*"."* ]] || [[ "$SERVER_HOST" == *"."* && ${#SERVER_HOST} -gt 15 ]]; then
  read -rp "$(echo -e "${YELLOW}Configurar SSL com Let's Encrypt? (s/n):${NC} ")" USE_SSL
  [[ "$USE_SSL" == "s" || "$USE_SSL" == "S" ]] && PROTOCOL="https"
fi

SERVER_URL="${PROTOCOL}://${SERVER_HOST}"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 2>/dev/null || openssl rand -hex 64)

echo ""
info "Iniciando instalação de: $PROJECT_NAME"
info "Servidor: $SERVER_URL"
echo ""

# ── 1. Atualiza sistema ────────────────────────────────────────────────────────
info "Atualizando sistema..."
apt-get update -qq && apt-get upgrade -yqq
success "Sistema atualizado"

# ── 2. Instala Node.js 20 ─────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  info "Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -yqq nodejs
  success "Node.js $(node -v) instalado"
else
  success "Node.js $(node -v) já instalado"
fi

# ── 3. Instala PostgreSQL ─────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  info "Instalando PostgreSQL 15..."
  apt-get install -yqq postgresql postgresql-contrib
  systemctl enable postgresql --quiet
  systemctl start postgresql
  success "PostgreSQL instalado"
else
  success "PostgreSQL já instalado"
fi

# ── 4. Instala nginx, PM2, git ────────────────────────────────────────────────
info "Instalando nginx, PM2, git..."
apt-get install -yqq nginx git
npm install -g pm2 --quiet
success "nginx, PM2 e git instalados"

# ── 5. Cria banco e usuário PostgreSQL ────────────────────────────────────────
DB_NAME="${PROJECT_NAME//-/_}"
DB_USER="${DB_NAME}_user"
DB_PASS=$(openssl rand -base64 16 | tr -d '/+=')
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

info "Criando banco de dados: $DB_NAME..."
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || warn "Usuário já existe"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || warn "Banco já existe"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null
success "Banco $DB_NAME criado"

# ── 6. Clona/atualiza repositório ─────────────────────────────────────────────
INSTALL_DIR="/opt/${PROJECT_NAME}"
info "Instalando aplicação em $INSTALL_DIR..."

if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR" && git pull --quiet
  success "Repositório atualizado"
else
  # Tenta clonar. Se não tiver acesso ao git, faz scp manual
  REPO_URL=${REPO_URL:-"https://github.com/eloviskis/dashboard-azure-devops-datasystem.git"}
  git clone --quiet "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    warn "Não foi possível clonar o repositório."
    warn "Copie o código manualmente para $INSTALL_DIR e execute novamente."
    exit 1
  }
  success "Repositório clonado"
fi
cd "$INSTALL_DIR"

# ── 7. Configura .env do backend ──────────────────────────────────────────────
info "Configurando variáveis de ambiente..."
cat > "$INSTALL_DIR/backend/.env" <<EOF
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
AZURE_ORG=${AZURE_ORG}
AZURE_PROJECT=${AZURE_PROJECT}
AZURE_PAT=${AZURE_PAT}
PORT=${BACKEND_PORT}
ALLOWED_ORIGIN=${SERVER_URL}
ADMIN_DEFAULT_PASSWORD=${ADMIN_PASSWORD}
EOF
success ".env criado"

# ── 8. Instala dependências do backend ────────────────────────────────────────
info "Instalando dependências do backend..."
cd "$INSTALL_DIR/backend" && npm install --quiet --production
success "Backend configurado"

# ── 9. Build do frontend ──────────────────────────────────────────────────────
info "Construindo frontend (VITE_API_URL=${SERVER_URL})..."
cd "$INSTALL_DIR/frontend"
npm install --quiet
VITE_API_URL="${SERVER_URL}" npm run build --quiet
success "Frontend compilado"

# ── 10. Configura nginx ───────────────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/${PROJECT_NAME}"
info "Configurando nginx..."
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name ${SERVER_HOST};

    root ${INSTALL_DIR}/frontend/dist;
    index index.html;

    # API → backend
    location /api/ {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 50M;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Assets com cache longo
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null
nginx -t && systemctl reload nginx
success "nginx configurado"

# ── 11. Configura SSL (opcional) ──────────────────────────────────────────────
if [ "$PROTOCOL" = "https" ]; then
  info "Configurando SSL com Let's Encrypt..."
  apt-get install -yqq certbot python3-certbot-nginx >/dev/null
  certbot --nginx -d "$SERVER_HOST" --non-interactive --agree-tos -m "admin@${SERVER_HOST}" || warn "SSL falhou — verifique se o domínio aponta para este servidor"
fi

# ── 12. Sobe com PM2 ──────────────────────────────────────────────────────────
info "Iniciando serviço com PM2..."
pm2 delete "$PROJECT_NAME" 2>/dev/null || true
pm2 start "$INSTALL_DIR/backend/server.js" --name "$PROJECT_NAME" --time
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
success "PM2 configurado"

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Instalação Concluída!                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}URL:${NC}        ${SERVER_URL}"
echo -e "  ${BLUE}Admin:${NC}      admin"
echo -e "  ${BLUE}Senha:${NC}      ${ADMIN_PASSWORD}"
echo -e "  ${BLUE}Banco:${NC}      ${DATABASE_URL}"
echo -e "  ${BLUE}PM2:${NC}        pm2 logs ${PROJECT_NAME}"
echo ""
echo -e "  ${YELLOW}Próximos passos:${NC}"
echo -e "  1. Acesse ${SERVER_URL} e faça login"
echo -e "  2. Vá em Admin → Configurações para personalizar logo e nome"
echo -e "  3. O primeiro sync do Azure DevOps inicia automaticamente"
echo ""
