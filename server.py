#!/usr/bin/env python3
"""Servidor local do checkout + integração segura com AmploPay."""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent / "dist"
PORT = int(os.getenv("PORT", "8765"))
API_BASE = os.getenv("AMPLO_API_BASE", os.getenv("AMPLOPAY_API_BASE", "https://app.amplopay.com/api/v1")).rstrip("/")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", f"http://127.0.0.1:{PORT}").rstrip("/")
PUBLIC_KEY = os.getenv("AMPLO_PUBLIC_KEY", os.getenv("AMPLOPAY_PUBLIC_KEY", "")).strip()
SECRET_KEY = os.getenv("AMPLO_SECRET_KEY", os.getenv("AMPLOPAY_SECRET_KEY", "")).strip()

# O navegador nunca envia preço. O servidor monta o pedido a partir deste catálogo.
BUMP_CATALOG = {
    "christmas": {"sku": "moldes-natalinos", "name": "Moldes natalinos", "price": 9.90},
    "guide": {"sku": "guia-producao", "name": "Guia de produção", "price": 6.90},
    "materials": {"sku": "lista-materiais", "name": "Lista de materiais", "price": 7.90},
}
BASE_PRICE = 10.00


def send_json(handler: SimpleHTTPRequestHandler, status: int, payload: dict) -> None:
    content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(content)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(content)


def parse_request(handler: SimpleHTTPRequestHandler) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as error:
        raise ValueError("Corpo da requisição inválido.") from error
    if length < 1 or length > 20_000:
        raise ValueError("Corpo da requisição inválido.")
    try:
        body = json.loads(handler.rfile.read(length).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Dados da requisição inválidos.") from error
    if not isinstance(body, dict):
        raise ValueError("Dados da requisição inválidos.")
    return body


def build_pix_order(data: dict) -> tuple[dict, float]:
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
    name = str(customer.get("name", "")).strip()
    email = str(customer.get("email", "")).strip()
    phone = re.sub(r"\D", "", str(customer.get("phone", "")))
    document = re.sub(r"\D", "", str(customer.get("document", "")))
    if len(name) < 2:
        raise ValueError("Informe o nome do comprador.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or not 10 <= len(phone) <= 13:
        raise ValueError("Informe nome, e-mail e telefone válidos para gerar o Pix.")
    if len(document) not in (11, 14):
        raise ValueError("Informe um CPF ou CNPJ válido para gerar o Pix.")

    bump_ids = data.get("bumpIds", [])
    if not isinstance(bump_ids, list):
        bump_ids = []
    bump_ids = list(dict.fromkeys(item for item in bump_ids if item in BUMP_CATALOG))
    extras = [BUMP_CATALOG[item] for item in bump_ids]
    amount = round(BASE_PRICE + sum(item["price"] for item in extras), 2)
    products = [{
        "id": "300-moldes-mesa-posta",
        "name": "300 Moldes de Mesa Posta",
        "quantity": 1,
        "price": BASE_PRICE,
        "physical": False,
    }]
    products.extend({
        "id": item["sku"],
        "name": item["name"],
        "quantity": 1,
        "price": item["price"],
        "physical": False,
    } for item in extras)
    identifier = f"mesa_{uuid.uuid4().hex}"
    order = {
        "identifier": identifier,
        "amount": amount,
        "client": {"name": name, "email": email, "phone": phone[-11:], "document": document},
        "products": products,
        "metadata": {
            "provider": "Casa do Artesanato",
            "orderId": identifier,
            "selectedBumps": ",".join(bump_ids),
        },
    }
    return order, amount


def request_amplopay(path: str, payload: dict) -> dict:
    if not PUBLIC_KEY or not SECRET_KEY:
        raise RuntimeError("Integração ainda não configurada. Defina as chaves do AmploPay no servidor.")
    request = Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "MesaAtelier/1.0", "x-public-key": PUBLIC_KEY, "x-secret-key": SECRET_KEY},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raw_response = error.read().decode("utf-8", errors="replace")
        try:
            remote = json.loads(raw_response)
            message = remote.get("message") or remote.get("errorDescription")
        except (json.JSONDecodeError, AttributeError):
            message = None
        detail = message or raw_response[:500] or "Sem detalhes retornados pela AmploPay."
        print(f"[AmploPay] HTTP {error.code}: {detail}", file=sys.stderr, flush=True)
        raise RuntimeError(
            f"Não foi possível criar o pagamento no gateway (HTTP {error.code}). Tente novamente em instantes."
        ) from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("Não foi possível falar com a AmploPay. Tente novamente.") from error
    if not isinstance(result, dict):
        raise RuntimeError("A AmploPay retornou uma resposta inválida.")
    return result


class CheckoutHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/health":
            send_json(self, HTTPStatus.OK, {"ok": True, "amplopayConfigured": bool(PUBLIC_KEY and SECRET_KEY)})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/api/checkout":
            send_json(self, HTTPStatus.NOT_FOUND, {"message": "Rota não encontrada."})
            return
        try:
            order, amount = build_pix_order(parse_request(self))
            transaction = request_amplopay("/gateway/pix/receive", order)
            pix = transaction.get("pix") if isinstance(transaction.get("pix"), dict) else {}
            code = pix.get("code")
            if not transaction.get("transactionId") or not isinstance(code, str) or not code:
                raise RuntimeError("A AmploPay não retornou o QR Code Pix. Confira a transação no painel antes de tentar novamente.")
            send_json(self, HTTPStatus.OK, {
                "transactionId": transaction["transactionId"],
                "total": amount,
                "pix": {"code": code, "image": pix.get("image"), "expiresAt": pix.get("expiresAt")},
            })
        except ValueError as error:
            send_json(self, HTTPStatus.BAD_REQUEST, {"message": str(error)})
        except RuntimeError as error:
            print(f"[checkout] {error}", file=sys.stderr, flush=True)
            send_json(self, HTTPStatus.SERVICE_UNAVAILABLE, {"message": str(error)})
        except Exception:
            send_json(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"message": "Não foi possível iniciar o pagamento. Tente novamente."})


if __name__ == "__main__":
    if not ROOT.is_dir():
        sys.exit(f"Pasta estática não encontrada: {ROOT}")
    print(f"Checkout em {PUBLIC_BASE_URL}")
    print("AmploPay configurado:", bool(PUBLIC_KEY and SECRET_KEY))
    ThreadingHTTPServer(("127.0.0.1", PORT), CheckoutHandler).serve_forever()
