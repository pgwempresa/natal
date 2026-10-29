"""Função serverless da Vercel para criar o checkout hospedado AmploPay."""
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
            checkout = server.request_amplopay(server.build_checkout(server.parse_request(self)))
            self._send_json(HTTPStatus.OK, {"checkoutUrl": checkout["checkoutUrl"]})
        except ValueError as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"message": str(error)})
        except RuntimeError as error:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"message": str(error)})
        except Exception:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": "Não foi possível iniciar o pagamento. Tente novamente."})
