#!/bin/bash
# Setup PostgreSQL para fluxometria
su - postgres -s /bin/bash -c "psql -c \"CREATE USER fluxometria_user WITH PASSWORD 'Flux2026DbStr0ng';\"" 2>/dev/null || echo "usuario ja existe"
su - postgres -s /bin/bash -c "psql -c \"CREATE DATABASE fluxometria OWNER fluxometria_user;\"" 2>/dev/null || echo "banco ja existe"
su - postgres -s /bin/bash -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE fluxometria TO fluxometria_user;\""
# PostgreSQL 15+ requer permissão adicional no schema public
su - postgres -s /bin/bash -c "psql -d fluxometria -c \"GRANT ALL ON SCHEMA public TO fluxometria_user;\""
echo "DB OK"
psql "postgresql://fluxometria_user:Flux2026DbStr0ng@localhost:5432/fluxometria" -c "SELECT 1 AS test" 2>&1 && echo "Conexao OK"
