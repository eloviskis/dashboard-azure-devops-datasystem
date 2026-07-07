#!/bin/bash
# Configura PostgreSQL para aceitar conexoes TCP com senha
PG_VERSION=16
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"

# Habilita listen_addresses
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "$PG_CONF"
sed -i "s/listen_addresses = '\*'/listen_addresses = 'localhost'/" "$PG_CONF" 2>/dev/null || true
grep -q "^listen_addresses" "$PG_CONF" || echo "listen_addresses = 'localhost'" >> "$PG_CONF"

# Adiciona regra de autenticacao por senha para fluxometria_user
grep -q "fluxometria_user" "$PG_HBA" || \
  echo "host    fluxometria     fluxometria_user    127.0.0.1/32    scram-sha-256" >> "$PG_HBA"

# Reinicia PostgreSQL
pg_ctlcluster ${PG_VERSION} main restart
sleep 2

# Testa conexao TCP
psql "postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5432/fluxometria" -c "SELECT 1 AS test" 2>&1 && echo "✅ Conexao TCP OK" || echo "❌ Conexao falhou"
