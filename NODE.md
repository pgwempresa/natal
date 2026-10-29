# Executar o projeto

Requer Node.js 22. Não há dependências externas para instalar.

Copie `.env.example` para `.env` e preencha as credenciais localmente. Execute `npm start` na raiz do projeto. O servidor abre em http://127.0.0.1:8765. Pare o servidor antigo antes de iniciar para liberar a porta.

Na Vercel, mantenha o diretório de saída `dist`. A rota `/api/checkout` agora é `api/checkout.js`, com a implementação compartilhada em `lib/payment.js`.

Variáveis: `AMPLO_PUBLIC_KEY` e `AMPLO_SECRET_KEY`. Os nomes `AMPLOPAY_PUBLIC_KEY` e `AMPLOPAY_SECRET_KEY` continuam aceitos. Nunca envie `.env` ao GitHub.

Execute `npm test` para verificar preços, contrato Pix, respostas inválidas e servidor local sem gerar cobranças reais.

Esta migração preserva o Pix. O cartão continua indisponível. Gerar Pix não confirma pagamento; confirmação e entrega automática não estão implementadas nesta versão.
