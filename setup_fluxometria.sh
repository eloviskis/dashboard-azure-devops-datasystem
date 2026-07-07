#!/bin/bash
set -e

# 1. Banco PostgreSQL
sudo -u postgres psql -c "CREATE USER fluxometria_user WITH PASSWORD 'Flux2026_Db@Str0ng';" 2>/dev/null || echo "Usuário já existe"
sudo -u postgres psql -c "CREATE DATABASE fluxometria OWNER fluxometria_user;" 2>/dev/null || echo "Banco já existe"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE fluxometria TO fluxometria_user;" 2>/dev/null
echo "✅ Banco configurado"

# 2. Clonar repositório
mkdir -p /opt/fluxometria
if [ -d /opt/fluxometria/.git ]; then
  cd /opt/fluxometria && git pull --quiet
  echo "✅ Repositório atualizado"
else
  git clone --quiet https://github.com/eloviskis/dashboard-azure-devops-datasystem.git /opt/fluxometria
  echo "✅ Repositório clonado"
fi

# 3. Branch do cliente
cd /opt/fluxometria
git checkout -B client/fluxometria --track origin/main 2>/dev/null || git checkout client/fluxometria 2>/dev/null || true
echo "✅ Branch client/fluxometria"

# 4. .env do backend
JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
cat > /opt/fluxometria/backend/.env <<EOF
DATABASE_URL=postgresql://fluxometria_user:Flux2026_Db@Str0ng@localhost:5432/fluxometria
JWT_SECRET=${JWT}
AZURE_ORG=demo-org
AZURE_PROJECT=Fluxometria
AZURE_PAT=demo-token-substitua-pelo-real
PORT=3002
ALLOWED_ORIGIN=https://fluxometria.com,http://fluxometria.com,https://www.fluxometria.com,http://77.37.41.105
ADMIN_DEFAULT_PASSWORD=Pwk8q12v@
EOF
echo "✅ .env criado (porta 3002)"

# 5. Dependências backend
cd /opt/fluxometria/backend && npm install --production --quiet
echo "✅ Backend deps instaladas"

# 6. Build frontend
cd /opt/fluxometria/frontend && npm install --quiet
VITE_API_URL=https://fluxometria.com npm run build --quiet
echo "✅ Frontend compilado"

# 7. Pasta web
mkdir -p /var/www/fluxometria
cp -r /opt/fluxometria/frontend/dist/* /var/www/fluxometria/
echo "✅ Arquivos web copiados para /var/www/fluxometria"

# 8. nginx
cat > /etc/nginx/sites-available/fluxometria <<'NGINX'
server {
    listen 80;
    server_name fluxometria.com www.fluxometria.com 77.37.41.105;

    root /var/www/fluxometria;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX
ln -sf /etc/nginx/sites-available/fluxometria /etc/nginx/sites-enabled/fluxometria
nginx -t && systemctl reload nginx
echo "✅ nginx configurado"

# 9. PM2
pm2 delete fluxometria 2>/dev/null || true
pm2 start /opt/fluxometria/backend/server.js --name fluxometria --time
pm2 save
echo "✅ PM2 iniciado como 'fluxometria'"

echo ""
echo "════════════════════════════════════════"
echo "  Deploy concluído!"
echo "  URL:    http://fluxometria.com (ou http://77.37.41.105)"
echo "  Admin:  admin / Pwk8q12v@"
echo "  PM2:    pm2 logs fluxometria"
echo "════════════════════════════════════════"
