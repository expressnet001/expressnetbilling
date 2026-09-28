import re
import time
from collections import defaultdict, deque

import redis
from django.conf import settings
from django.http import JsonResponse


_SAFE_API_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
_SUSPICIOUS_REQUEST_RE = re.compile(
    r"(?:\.\./|%2e%2e|%00|<script|javascript:|union(?:\s|%20|\+)+select|(?:/|%5c)(?:etc/passwd|\.env)|wp-admin|wp-login|phpmyadmin)",
    re.IGNORECASE,
)
_redis_client = None


def _get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
            health_check_interval=30,
        )
    return _redis_client


def _host_without_port(request):
    return request.get_host().split(":", 1)[0].strip(".").lower()


def _is_local_host(host):
    return host in {"localhost", "127.0.0.1", "[::1]"} or host.startswith("127.")


def _is_admin_host(request):
    host = _host_without_port(request)
    admin_subdomain = str(getattr(settings, "ADMIN_SUBDOMAIN", "admin")).strip(".").lower()
    base_domain = str(getattr(settings, "PUBLIC_BASE_DOMAIN", "")).strip(".").lower()
    return host == admin_subdomain or host == f"{admin_subdomain}.{base_domain}" or host.startswith(f"{admin_subdomain}.")


def _client_ip(request):
    remote_addr = (request.META.get("REMOTE_ADDR") or "").strip()
    trusted_proxies = {
        item.strip()
        for item in str(getattr(settings, "TRUSTED_PROXY_IPS", "")).split(",")
        if item.strip()
    }
    if remote_addr in trusted_proxies:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return remote_addr or "unknown"


class ApiGatewayMiddleware:
    """Apply cheap request screening before API views or authentication run."""

    buckets = defaultdict(deque)

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        api_prefix = f"/{str(settings.API_BASE_PATH).strip('/')}/"
        if not request.path.startswith(api_prefix):
            return self.get_response(request)

        if request.method.upper() not in _SAFE_API_METHODS:
            return JsonResponse({"message": "HTTP method is not allowed."}, status=405)

        if len(request.path) > 2048 or len(request.META.get("QUERY_STRING", "")) > 4096:
            return JsonResponse({"message": "Request is too large."}, status=414)

        if _SUSPICIOUS_REQUEST_RE.search(f"{request.path}?{request.META.get('QUERY_STRING', '')}"):
            return JsonResponse({"message": "Request rejected."}, status=400)

        content_length = request.META.get("CONTENT_LENGTH")
        try:
            if content_length and int(content_length) > int(settings.API_MAX_BODY_BYTES):
                return JsonResponse({"message": "Request body is too large."}, status=413)
        except (TypeError, ValueError):
            return JsonResponse({"message": "Invalid request length."}, status=400)

        # Admin APIs are only exposed on the admin host. Local development stays usable.
        api_path = request.path[len(api_prefix):].strip("/").lower()
        is_admin_api = api_path.startswith(f"{str(settings.ADMIN_API_PATH).strip('/').lower()}/") or api_path.startswith("v1/core/admin/")
        if is_admin_api and not (_is_admin_host(request) or _is_local_host(_host_without_port(request))):
            return JsonResponse({"message": "This API is only available on the admin host."}, status=403)

        limit = max(1, int(getattr(settings, "API_GATEWAY_RATE_LIMIT", 300)))
        window = max(1, int(getattr(settings, "API_GATEWAY_RATE_WINDOW", 60)))
        if api_path.endswith("/auth/login"):
            limit = min(limit, 20)
        key = (_client_ip(request), request.method.upper(), api_path)
        now = time.time()
        try:
            client = _get_redis_client()
            redis_key = "gateway_rl:" + ":".join(str(part).replace("/", "_") for part in key)
            count = client.incr(redis_key)
            if count == 1:
                client.expire(redis_key, window)
            if count > limit:
                return JsonResponse({"message": "Too many requests. Please try again later."}, status=429)
        except Exception:
            # Keep a bounded local fallback when Redis is unavailable.
            bucket = self.buckets[key]
            while bucket and bucket[0] <= now - window:
                bucket.popleft()
            if len(bucket) >= limit:
                return JsonResponse({"message": "Too many requests. Please try again later."}, status=429)
            bucket.append(now)
        return self.get_response(request)


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("X-Frame-Options", "DENY")
        response.setdefault("X-XSS-Protection", "1; mode=block")
        response.setdefault("Referrer-Policy", getattr(settings, "SECURE_REFERRER_POLICY", "strict-origin-when-cross-origin"))
        response.setdefault("Cross-Origin-Opener-Policy", getattr(settings, "SECURE_CROSS_ORIGIN_OPENER_POLICY", "same-origin"))
        if response.get("Content-Type", "").startswith("text/html"):
            response.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
            )
        return response


class SimpleRateLimitMiddleware:
    buckets = defaultdict(deque)

    def __init__(self, get_response):
        self.get_response = get_response

    def rules(self):
        api_base = settings.API_BASE_PATH.strip("/")
        admin_base = settings.ADMIN_API_PATH.strip("/")
        return {
            ("POST", f"/{api_base}/auth/register"): (5, 15 * 60),
            ("POST", f"/{api_base}/{admin_base}/auth/login"): (5, 15 * 60),
            ("POST", f"/{api_base}/vouchers"): (30, 60 * 60),
        }

    def __call__(self, request):
        if not getattr(settings, "RATE_LIMIT_ENABLED", not settings.DEBUG):
            return self.get_response(request)

        api_base = settings.API_BASE_PATH.strip("/")
        rule = self.rules().get((request.method.upper(), request.path.rstrip("/")))
        if request.method.upper() == "POST" and request.path.startswith(f"/{api_base}/public/") and request.path.rstrip("/").endswith("/pay"):
            rule = (10, 10 * 60)
        if request.method.upper() == "GET" and request.path.startswith(f"/{api_base}/public/") and request.path.rstrip("/").endswith("/verify"):
            rule = (30, 10 * 60)
        if request.method.upper() == "POST" and request.path.startswith(f"/{api_base}/public/") and (
            request.path.rstrip("/").endswith("/redeem")
            or request.path.rstrip("/").endswith("/voucher-login")
        ):
            rule = (20, 10 * 60)
        if request.method.upper() == "GET" and request.path.startswith(f"/{api_base}/router/agent/"):
            rule = (120, 10 * 60)
        if request.method.upper() == "POST" and request.path.startswith(f"/{api_base}/daraja/callback/"):
            rule = (20, 60)
        if rule:
            limit, window = rule
            ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", "")).split(",")[0].strip()
            key = (request.method.upper(), request.path.rstrip("/"), ip)
            try:
                client = _get_redis_client()
                redis_key = "rl:" + ":".join(str(part) for part in key)
                count = client.incr(redis_key)
                if count == 1:
                    client.expire(redis_key, window)
                if count > limit:
                    return JsonResponse({"message": "Too many attempts. Please try again later."}, status=429)
                return self.get_response(request)
            except Exception:
                pass
            now = time.time()
            bucket = self.buckets[key]
            while bucket and bucket[0] <= now - window:
                bucket.popleft()
            if len(bucket) >= limit:
                return JsonResponse({"message": "Too many attempts. Please try again later."}, status=429)
            bucket.append(now)
        return self.get_response(request)
