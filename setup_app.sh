#!/bin/bash
set -e

echo "=== 1. Clonando repositório em /opt/fluxometria ==="
git clone --quiet https://github.com/eloviskis/dashboard-azure-devops-datasystem.git /opt/fluxometria
cd /opt/fluxometria
echo "✅ Clonado"

echo "=== 2. Criando .env do backend ==="
JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
cat > /opt/fluxometria/backend/.env <<EOF
DATABASE_URL=postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria
JWT_SECRET=${JWT}
AZURE_ORG=demo-org
AZURE_PROJECT=Fluxometria
AZURE_PAT=demo-token-substitua-pelo-real
PORT=3002
ALLOWED_ORIGIN=https://fluxometria.com,http://fluxometria.com,https://www.fluxometria.com,http://www.fluxometria.com,http://77.37.41.105
ADMIN_DEFAULT_PASSWORD=Pwk8q12v@
EOF
echo "✅ .env criado (porta backend: 3002, postgres: 5433)"

echo "=== 3. Instalando dependências do backend ==="
cd /opt/fluxometria/backend && npm install --production --silent
echo "✅ Backend OK"

echo "=== 4. Compilando frontend ==="
cd /opt/fluxometria/frontend && npm install --silent
VITE_API_URL="" npm run build 2>&1 | tail -4
echo "✅ Frontend compilado"

echo "=== 5. Configurando pasta web ==="
mkdir -p /var/www/fluxometria
cp -r /opt/fluxometria/frontend/dist/* /var/www/fluxometria/
echo "✅ Arquivos em /var/www/fluxometria"

echo "Pronto - aguarde o nginx e PM2"
