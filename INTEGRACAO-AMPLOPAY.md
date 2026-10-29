# Integração AmploPay

O checkout chama `POST /api/checkout`. O servidor calcula o valor por conta própria, cria o checkout hospedado na AmploPay e redireciona o cliente para o `checkoutUrl` retornado. Assim, chaves e dados de cartão nunca entram no HTML.

## Antes de ligar

1. No painel AmploPay, gere a chave pública e a chave secreta em **Integrações > API**.
2. Peça ao suporte da AmploPay a ativação de **criação de checkout via API** na sua conta.
3. Copie `.env.example` para `.env` e preencha as duas chaves. Não publique o `.env`.
4. Em produção, defina `PUBLIC_BASE_URL` com seu domínio HTTPS real.

## Rodar localmente

```bash
set -a
source .env
set +a
python3 server.py
```

Abra `http://127.0.0.1:8765/checkout.html`. Sem as chaves, o botão mostra que a integração ainda precisa ser configurada. Com as chaves, ele cria a oferta via `POST /api/v1/gateway/checkout` e redireciona para a URL devolvida pela AmploPay.

## Produção

Publique o servidor com HTTPS, mantenha as chaves somente em variáveis de ambiente e configure o webhook/entrega de acesso no painel AmploPay. `success.html` é apenas a página de retorno visual.
