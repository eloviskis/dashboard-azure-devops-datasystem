@echo off
REM ============================================================
REM  Data System - Sincronizador Azure DevOps -> PostgreSQL
REM  
REM  Este script executa o datasystem-sync.exe
REM  Coloque um arquivo config.json nesta mesma pasta com:
REM  {
REM    "AZURE_ORG": "sua-org",
REM    "AZURE_PROJECT": "seu-projeto",
REM    "AZURE_PAT": "seu-token",
REM    "DATABASE_URL": "postgresql://user:pass@host:5432/db"
REM  }
REM
REM  Ou defina as variaveis de ambiente antes de rodar.
REM
REM  Uso:
REM    datasystem-sync.bat              (modo continuo - a cada 30 min)
REM    datasystem-sync.bat --once       (executa uma vez e sai)
REM    datasystem-sync.bat --config     (mostra configuracao atual)
REM    datasystem-sync.bat --help       (ajuda)
REM ============================================================

cd /d "%~dp0"

REM Procura o .exe em dist\ ou na pasta atual
if exist "dist\datasystem-sync.exe" (
    set "SYNC_EXE=dist\datasystem-sync.exe"
) else if exist "datasystem-sync.exe" (
    set "SYNC_EXE=datasystem-sync.exe"
) else (
    echo [ERRO] datasystem-sync.exe nao encontrado.
    echo Esperado em: dist\datasystem-sync.exe
    echo.
    echo Para gerar o executavel, execute:
    echo   cd backend\sync-app
    echo   npm install
    echo   npm run build:windows
    pause
    exit /b 1
)

echo ============================================================
echo   Data System - Sincronizador Azure DevOps
echo ============================================================
echo.

%SYNC_EXE% %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O sincronizador terminou com erro (codigo: %ERRORLEVEL%)
    pause
)
