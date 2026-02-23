<#
.SYNOPSIS
    Deploy do Dashboard Azure DevOps para o Vercel.

.DESCRIPTION
    Usa a Vercel Deployments API para triggerar deploys via Git, respeitando
    rootDirectory configurado em cada projeto Vercel.
    
    NAO usa o Vercel CLI (que tem bugs com rootDirectory em monorepos).
    Requer apenas que o Vercel CLI esteja autenticado (para ler o token salvo).

.PARAMETER Target
    Qual projeto deployar: 'frontend', 'backend', ou 'all' (padrao: 'all')

.PARAMETER Wait
    Se especificado, aguarda ate o deploy ficar Ready ou Error.

.EXAMPLE
    .\deploy.ps1                     # Deploy ambos em producao
    .\deploy.ps1 -Target frontend    # Deploy so o frontend
    .\deploy.ps1 -Target backend     # Deploy so o backend
    .\deploy.ps1 -Target all -Wait   # Deploy ambos e aguarda resultado
#>

param(
    [ValidateSet('frontend', 'backend', 'all')]
    [string]$Target = 'all',

    [switch]$Wait
)

$ErrorActionPreference = 'Stop'

# ---- Config ----
$TeamId = "team_wuu5CixHUwTElnKB2xFiUHlZ"
$Projects = @{
    backend  = @{
        projectId = "prj_kLEwrUAJ4W58UW86xoYQoZYZlgd2"
        prodUrl   = "https://backend-hazel-three-14.vercel.app"
    }
    frontend = @{
        projectId = "prj_urke5XjJu9wNs0aaE2np0dzc4HEv"
        prodUrl   = "https://devops-datasystem.vercel.app"
    }
}
$GitOrg  = "eloviskis"
$GitRepo = "dashboard-azure-devops-datasystem"
$GitRef  = "main"

# ---- Auth ----
$authFile = Join-Path $env:APPDATA "com.vercel.cli\Data\auth.json"
if (-not (Test-Path $authFile)) {
    Write-Host "ERRO: Token Vercel nao encontrado. Execute 'vercel login' primeiro." -ForegroundColor Red
    exit 1
}
$token = (Get-Content $authFile | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }

function Deploy-VercelProject {
    param([string]$Name)

    $proj = $Projects[$Name]
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  Deployando: $Name" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $body = @{
        name      = $Name
        project   = $proj.projectId
        target    = "production"
        gitSource = @{
            type = "github"
            org  = $GitOrg
            repo = $GitRepo
            ref  = $GitRef
        }
    } | ConvertTo-Json -Depth 5

    try {
        $resp = Invoke-RestMethod "https://api.vercel.com/v13/deployments?teamId=$TeamId" `
            -Method POST -Body $body -ContentType "application/json" -Headers $headers

        Write-Host "  [OK] Deploy triggered: https://$($resp.url)" -ForegroundColor Green
        Write-Host "  ID: $($resp.id) | Status: $($resp.readyState)" -ForegroundColor DarkGray

        if ($Wait) {
            Write-Host "  [..] Aguardando conclusao..." -ForegroundColor DarkGray
            $maxWait = 180
            $elapsed = 0
            while ($elapsed -lt $maxWait) {
                Start-Sleep -Seconds 5
                $elapsed += 5
                try {
                    $status = Invoke-RestMethod "https://api.vercel.com/v13/deployments/$($resp.id)?teamId=$TeamId" `
                        -Headers $headers
                    if ($status.readyState -eq 'READY') {
                        Write-Host "  [OK] Deploy concluido! ($elapsed`s)" -ForegroundColor Green
                        return @{ success = $true; url = $resp.url }
                    }
                    elseif ($status.readyState -eq 'ERROR') {
                        Write-Host "  [FALHA] Deploy falhou! ($elapsed`s)" -ForegroundColor Red
                        return @{ success = $false; url = $resp.url }
                    }
                    Write-Host "  [..] $($status.readyState) ($elapsed`s)" -ForegroundColor DarkGray
                }
                catch {
                    Write-Host "  [WARN] Erro ao verificar status: $_" -ForegroundColor Yellow
                }
            }
            Write-Host "  [WARN] Timeout atingido ($maxWait`s)" -ForegroundColor Yellow
        }

        return @{ success = $true; url = $resp.url }
    }
    catch {
        Write-Host "  [FALHA] Erro ao triggerar deploy: $_" -ForegroundColor Red
        return @{ success = $false; url = $null }
    }
}

function Test-BackendCors {
    Write-Host "`n  [..] Testando CORS do backend..." -ForegroundColor DarkGray
    $maxRetries = 3
    for ($i = 1; $i -le $maxRetries; $i++) {
        try {
            $response = Invoke-WebRequest "$($Projects.backend.prodUrl)/api/auth/login" `
                -Method OPTIONS -UseBasicParsing `
                -Headers @{
                    Origin                           = "https://devops-datasystem.vercel.app"
                    "Access-Control-Request-Method"   = "POST"
                    "Access-Control-Request-Headers"  = "content-type"
                }
            if ($response.StatusCode -eq 204) {
                Write-Host "  [OK] CORS preflight OK (204)" -ForegroundColor Green
                return $true
            }
        }
        catch {
            if ($i -lt $maxRetries) {
                Write-Host "  [..] Tentativa $i/$maxRetries falhou, aguardando 10s (cold start)..." -ForegroundColor Yellow
                Start-Sleep -Seconds 10
            }
            else {
                Write-Host "  [FALHA] CORS preflight falhou apos $maxRetries tentativas" -ForegroundColor Red
                return $false
            }
        }
    }
}

# ---- Main ----
Write-Host "`nDashboard Azure DevOps - Deploy Script" -ForegroundColor White
Write-Host "Usa Vercel API (respeita rootDirectory configurado)`n" -ForegroundColor DarkGray

$results = @{}

if ($Target -in @('backend', 'all')) {
    $results['backend'] = (Deploy-VercelProject 'backend').success
}

if ($Target -in @('frontend', 'all')) {
    $results['frontend'] = (Deploy-VercelProject 'frontend').success
}

if ($Wait -and $results.ContainsKey('backend') -and $results['backend']) {
    Start-Sleep -Seconds 5
    Test-BackendCors
}

# Resumo
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESUMO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
foreach ($key in $results.Keys) {
    $icon = if ($results[$key]) { "[OK]" } else { "[FALHA]" }
    $color = if ($results[$key]) { "Green" } else { "Red" }
    Write-Host "  $icon $key" -ForegroundColor $color
}
Write-Host "`nMonitore: https://vercel.com/eloi-carlos-santaroza-s-projects`n" -ForegroundColor DarkGray
