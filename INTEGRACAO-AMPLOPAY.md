# Integração AmploPay

O checkout chama `POST /api/checkout`. O servidor calcula o valor por conta própria e cria uma transação Pix diretamente pela rota `/gateway/pix/receive`. A resposta devolve o QR Code e o código Pix copia-e-cola, exibidos na própria página.

## Antes de ligar

1. No painel AmploPay, gere a chave pública e a chave secreta em **Integrações > API**, com as permissões de criar transações.
2. Configure `AMPLO_PUBLIC_KEY` e `AMPLO_SECRET_KEY` na Vercel. Os nomes antigos `AMPLOPAY_PUBLIC_KEY` e `AMPLOPAY_SECRET_KEY` também são aceitos por compatibilidade.
3. Copie `.env.example` para `.env` e preencha as duas chaves. Não publique o `.env`.
4. Em produção, defina `PUBLIC_BASE_URL` com seu domínio HTTPS real.

## Rodar localmente

```bash
set -a
source .env
set +a
python3 server.py
```

Abra `http://127.0.0.1:8765/checkout.html`. Sem as chaves, o botão mostra que a integração ainda precisa ser configurada. Com as chaves, ele cria uma transação via `POST /api/v1/gateway/pix/receive` e mostra o QR Code e o código Pix devolvidos pela AmploPay.

## Produção

Publique o servidor com HTTPS, mantenha as chaves somente em variáveis de ambiente e configure o webhook/entrega de acesso no painel AmploPay. `success.html` é apenas a página de retorno visual.
