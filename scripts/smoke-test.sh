#!/usr/bin/env bash
# Smoke-test do cenário de aceitação contra a API rodando.
# Requisito: API no ar (http://localhost:3333) + seed aplicado.
# Uso:  bash scripts/smoke-test.sh
set -euo pipefail

API="${API:-http://localhost:3333/api/v1}"
EMAIL="${EMAIL:-admin@corpoonda.com.br}"
PASS="${PASS:-MudarSenha123!}"
SKU="${SKU:-TOP-MARE-AZC-P}"

# jq é opcional; se não houver, mostramos o JSON cru.
have_jq() { command -v jq >/dev/null 2>&1; }
get() { if have_jq; then jq -r "$1"; else cat; fi; }

echo "== 1) Login ($EMAIL) =="
LOGIN=$(curl -fsS -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
if have_jq; then TOKEN=$(echo "$LOGIN" | jq -r '.accessToken'); else
  TOKEN=$(echo "$LOGIN" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'); fi
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "FALHA no login:"; echo "$LOGIN"; exit 1; }
echo "OK (token obtido)"; echo

AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

echo "== 2) Lookup do SKU $SKU =="
curl -fsS "${AUTH[@]}" "$API/inventory/variants/lookup?barcode=$SKU" | get '{sku,name:.productName,color,size}'; echo

echo "== 3) Entrada de produção: +20 =="
curl -fsS -X POST "${AUTH[@]}" -H "Idempotency-Key: entrada-$(date +%s)" \
  "$API/inventory/production-entry" \
  -d "{\"barcodeOrSku\":\"$SKU\",\"quantity\":20}" | get '{onHand,available}'; echo

echo "== 4) Venda manual: -3 (esperado saldo 17) =="
SALE_KEY="venda-fixa-001"   # chave fixa para testar idempotência no passo 5
curl -fsS -X POST "${AUTH[@]}" -H "Idempotency-Key: $SALE_KEY" \
  "$API/inventory/manual-sale" \
  -d "{\"barcodeOrSku\":\"$SKU\",\"quantity\":3}" | get '{onHand,available}'; echo

echo "== 5) Reenvio da MESMA venda (idempotente — deve permanecer 17) =="
curl -fsS -X POST "${AUTH[@]}" -H "Idempotency-Key: $SALE_KEY" \
  "$API/inventory/manual-sale" \
  -d "{\"barcodeOrSku\":\"$SKU\",\"quantity\":3}" | get '{onHand,available}'; echo

echo "== 6) Tentativa de vender 18 (deve ser BLOQUEADA; saldo continua 17) =="
HTTP=$(curl -s -o /tmp/oversell.json -w '%{http_code}' -X POST "${AUTH[@]}" \
  -H "Idempotency-Key: oversell-$(date +%s)" \
  "$API/inventory/manual-sale" \
  -d "{\"barcodeOrSku\":\"$SKU\",\"quantity\":18}")
echo "HTTP $HTTP (esperado 409):"; cat /tmp/oversell.json | get '.error'; echo

echo "== 7) Saldo final =="
curl -fsS "${AUTH[@]}" "$API/inventory?take=5" | get '.'
echo
echo "== FIM =="
