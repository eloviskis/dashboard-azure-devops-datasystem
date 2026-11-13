# Deploy direto na VPS via SCP
# Arquivos modificados: backend/server.js, frontend/src/components/TeamsIntegrationPage.tsx

$VPS_HOST = "187.77.55.172"
$VPS_USER = "root"
$BACKEND_DIR = "/opt/devops-dashboard/backend"
$FRONTEND_DIR = "/var/www/devops-dashboard"
$PM2_PROCESS = "devops-dashboard"

Write-Host "`n🚀 Iniciando deploy na VPS $VPS_HOST..." -ForegroundColor Cyan

# 1. Copiar server.js modificado
Write-Host "`n📦 Copiando backend/server.js..." -ForegroundColor Yellow
scp "backend/server.js" "${VPS_USER}@${VPS_HOST}:${BACKEND_DIR}/server.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao copiar server.js" -ForegroundColor Red
    exit 1
}
Write-Host "✅ server.js copiado" -ForegroundColor Green

# 2. Copiar TeamsIntegrationPage.tsx
Write-Host "`n📦 Copiando frontend/src/components/TeamsIntegrationPage.tsx..." -ForegroundColor Yellow
ssh "${VPS_USER}@${VPS_HOST}" "mkdir -p ${FRONTEND_DIR}/src/components"
scp "frontend/src/components/TeamsIntegrationPage.tsx" "${VPS_USER}@${VPS_HOST}:${FRONTEND_DIR}/src/components/TeamsIntegrationPage.tsx"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao copiar TeamsIntegrationPage.tsx" -ForegroundColor Red
    exit 1
}
Write-Host "✅ TeamsIntegrationPage.tsx copiado" -ForegroundColor Green

# 3. Rebuild frontend na VPS
Write-Host "`n🔨 Rebuilding frontend na VPS..." -ForegroundColor Yellow
ssh "${VPS_USER}@${VPS_HOST}" "cd ${FRONTEND_DIR}; npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao buildar frontend" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend buildado" -ForegroundColor Green

# 4. Reiniciar PM2
Write-Host "`n🔄 Reiniciando PM2 ($PM2_PROCESS)..." -ForegroundColor Yellow
ssh "${VPS_USER}@${VPS_HOST}" "pm2 restart ${PM2_PROCESS}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao reiniciar PM2" -ForegroundColor Red
    exit 1
}
Write-Host "✅ PM2 reiniciado" -ForegroundColor Green

# 5. Verificar status
Write-Host "`n📊 Status do serviço:" -ForegroundColor Yellow
ssh "${VPS_USER}@${VPS_HOST}" "pm2 status"

Write-Host "`n✅ Deploy concluído com sucesso!" -ForegroundColor Green
Write-Host "🌐 Acesse: http://$VPS_HOST" -ForegroundColor Cyan
