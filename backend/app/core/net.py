from fastapi import Request


def client_ip(request: Request) -> str:
    """Реальный IP клиента с учётом reverse-proxy."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""