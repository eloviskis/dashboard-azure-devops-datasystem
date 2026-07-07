#!/bin/bash
# Verifica e força scram-sha-256 para senha
su - postgres -s /bin/bash -c "psql -c \"SHOW password_encryption;\""
su - postgres -s /bin/bash -c "psql -c \"SET password_encryption = 'scram-sha-256'; ALTER USER fluxometria_user WITH PASSWORD 'Flux2026DbStr0ng';\""
echo "Senha salva como scram-sha-256"

# Testa conexão
psql "postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5432/fluxometria" -c "SELECT current_user, current_database();" 2>&1 && echo "✅ OK" || {
  echo "❌ Ainda falhou — tentando via socket..."
  PGPASSWORD="Flux2026DbStr0ng" psql -U fluxometria_user -d fluxometria -c "SELECT current_user;" 2>&1
}
