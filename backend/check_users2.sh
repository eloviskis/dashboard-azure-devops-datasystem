#!/bin/bash
# Testa login
echo "=== Tentando login ==="
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys; print(sys.stdin.read())'

echo ""
echo "=== Usuarios no banco ==="
psql postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard \
  -t -c "SELECT username, role FROM users LIMIT 10"
