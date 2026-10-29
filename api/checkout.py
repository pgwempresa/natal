"""Função serverless da Vercel para gerar uma transação Pix AmploPay."""
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

import server


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        server.send_json(self, status, payload)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            host = self.headers.get("host", "").strip()
            if host:
                server.PUBLIC_BASE_URL = f"https://{host}"
            order, amount = server.build_pix_order(server.parse_request(self))
            transaction = server.request_amplopay("/gateway/pix/receive", order)
            pix = transaction.get("pix") if isinstance(transaction.get("pix"), dict) else {}
            code = pix.get("code")
            if not transaction.get("transactionId") or not isinstance(code, str) or not code:
                raise RuntimeError("A AmploPay não retornou o QR Code Pix. Confira a transação no painel antes de tentar novamente.")
            self._send_json(HTTPStatus.OK, {
                "transactionId": transaction["transactionId"],
                "total": amount,
                "pix": {"code": code, "image": pix.get("image"), "expiresAt": pix.get("expiresAt")},
            })
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"message": str(error)})
        except RuntimeError as error:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"message": str(error)})
        except Exception:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": "Não foi possível iniciar o pagamento. Tente novamente."})
