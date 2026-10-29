#!/usr/bin/env python3
"""Servidor local do checkout + integração segura com AmploPay."""
from __future__ import annotations

import json
import os
import re
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent / "dist"
PORT = int(os.getenv("PORT", "8765"))
API_BASE = os.getenv("AMPLOPAY_API_BASE", "https://app.amplopay.com/api/v1").rstrip("/")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", f"http://127.0.0.1:{PORT}").rstrip("/")
PUBLIC_KEY = os.getenv("AMPLOPAY_PUBLIC_KEY", "")
SECRET_KEY = os.getenv("AMPLOPAY_SECRET_KEY", "")

# O navegador nunca envia preço. O servidor monta o pedido a partir deste catálogo.
BUMP_CATALOG = {
    "christmas": {"name": "Moldes natalinos", "price": 9.90},
    "guide": {"name": "Guia de produção", "price": 6.90},
    "materials": {"name": "Lista de materiais", "price": 7.90},
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


def build_checkout(data: dict) -> dict:
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}
    email = str(customer.get("email", "")).strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Informe um e-mail válido para continuar.")

    bump_ids = data.get("bumpIds", [])
    if not isinstance(bump_ids, list):
        bump_ids = []
    bump_ids = list(dict.fromkeys(item for item in bump_ids if item in BUMP_CATALOG))
    extras = [BUMP_CATALOG[item] for item in bump_ids]
    amount = round(BASE_PRICE + sum(item["price"] for item in extras), 2)
    offer_name = "300 Moldes de Mesa Posta"
    if extras:
        offer_name += " + " + ", ".join(item["name"] for item in extras)

    prefill = {"email": email}
    phone = str(customer.get("phone", "")).strip()
    document = re.sub(r"\D", "", str(customer.get("document", "")))
    if phone:
        prefill["phone"] = phone
    if document:
        prefill["document"] = document

    return {
        "product": {
            "externalId": "casa-do-artesanato-300-moldes-mesa-posta",
            "name": "300 Moldes de Mesa Posta",
            "photos": [f"{PUBLIC_BASE_URL}/assets/cover-300-moldes.webp"],
            "offer": {
                "name": offer_name,
                "price": amount,
                "offerType": "NATIONAL",
                "currency": "BRL",
                "lang": "pt-BR",
                "warranty": "7_days",
                "category": "Artesanato",
            },
        },
        "settings": {
            "paymentMethods": ["PIX", "CREDIT_CARD"],
            "acceptedDocs": ["CPF", "CNPJ"],
            "askForAddress": False,
            "thankYouPage": f"{PUBLIC_BASE_URL}/success.html",
        },
        "customer": prefill,
        "trackProps": {
            "source": "checkout-casa-do-artesanato",
            "selectedBumps": ",".join(bump_ids),
            "amount": f"{amount:.2f}",
        },
    }


def request_amplopay(payload: dict) -> dict:
    if not PUBLIC_KEY or not SECRET_KEY:
        raise RuntimeError("Integração ainda não configurada. Defina as chaves do AmploPay no servidor.")
    request = Request(
        f"{API_BASE}/gateway/checkout",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json", "x-public-key": PUBLIC_KEY, "x-secret-key": SECRET_KEY},
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
        raise RuntimeError(f"AmploPay recusou a criação do checkout (HTTP {error.code}): {detail}") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("Não foi possível falar com a AmploPay. Tente novamente.") from error
    if not isinstance(result, dict) or not result.get("checkoutUrl"):
        raise RuntimeError(result.get("message") if isinstance(result, dict) else "A AmploPay não retornou o link de pagamento.")
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
            checkout = request_amplopay(build_checkout(parse_request(self)))
            send_json(self, HTTPStatus.OK, {"checkoutUrl": checkout["checkoutUrl"]})
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
