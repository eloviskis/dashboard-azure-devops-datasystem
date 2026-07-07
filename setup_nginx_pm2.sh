#!/bin/bash
set -e

echo "=== Configurando nginx ==="
cat > /etc/nginx/sites-available/fluxometria << 'NGINX'
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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
        proxy_read_timeout 120s;
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
echo "✅ nginx configurado e recarregado"

echo "=== Iniciando PM2 ==="
pm2 delete fluxometria 2>/dev/null || true
pm2 start /opt/fluxometria/backend/server.js --name fluxometria --time
pm2 save
echo "✅ PM2 'fluxometria' rodando na porta 3002"

echo "=== Verificando serviço ==="
sleep 3
curl -s http://localhost:3002/api/health 2>&1 || curl -s http://localhost:3002/ 2>&1 | head -50

echo ""
echo "========================================"
echo "  ✅ Deploy concluído!"
echo "  URL:    http://77.37.41.105"
echo "  URL:    http://fluxometria.com (após DNS)"
echo "  Admin:  admin / Pwk8q12v@"
echo "  Pasta:  /opt/fluxometria"
echo "  Web:    /var/www/fluxometria"
echo "  PM2:    pm2 logs fluxometria"
echo "========================================"
