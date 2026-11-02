# Pixel e API de Conversões

Pixel: `1817116509407691`.

Na Vercel, adicione `META_ACCESS_TOKEN` com o token da API de Conversões do mesmo Pixel. O token fica somente no servidor. `META_PIXEL_ID` é opcional, pois este ID já é o padrão. Para usar Eventos de Teste, preencha temporariamente `META_TEST_EVENT_CODE`. Depois de alterar as variáveis, faça um novo deploy.

Eventos no navegador: PageView nas três páginas, ViewContent ao entrar na LP, InitiateCheckout ao abrir checkout, Purchase ao gerar Pix ou receber cartão aprovado. Cartão em análise não dispara Purchase.

Conforme solicitado, Purchase no Pix representa geração da cobrança, antes do pagamento. O valor inclui adicionais. O mesmo event_id, `purchase_<transactionId>`, é enviado pelo navegador e pelo servidor para deduplicação. A página success.html aberta diretamente não registra Purchase.

O servidor envia Purchase à Meta após a resposta do gateway, usando valor do servidor e email/telefone com SHA-256; não envia CPF, endereço completo, dados de cartão ou código Pix. Falhas da Meta não impedem a geração do pagamento. Sem token, funciona apenas o Pixel do navegador.

Testes automatizados usam respostas simuladas. O recebimento real dos eventos deve ser conferido no Gerenciador de Eventos após configurar o token.
