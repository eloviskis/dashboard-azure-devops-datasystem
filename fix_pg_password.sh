#!/bin/bash
# Redefine senha e testa conexão TCP
su - postgres -s /bin/bash -c "psql -c \"ALTER USER fluxometria_user WITH PASSWORD 'Flux2026DbStr0ng';\""
echo "Senha redefinida"
psql "postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5432/fluxometria" -c "SELECT 1 AS test" 2>&1 && echo "✅ Conexao TCP OK" || echo "❌ Ainda falhou"

# Mostra pg_hba.conf para diagnóstico
echo "--- pg_hba.conf (últimas 10 linhas) ---"
tail -10 /etc/postgresql/16/main/pg_hba.conf
