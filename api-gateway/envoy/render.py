"""AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-12
Scope: Render stock Envoy configuration; use its native JWT, request-ID and error behaviour.
Author review: Pending human review.
"""
# AI-generated; review pending. This process exits before Envoy serves requests.
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urljoin

TYPE = "type.googleapis.com/"
JWT = "envoy.filters.http.jwt_authn"
REMOVED = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
           "trailers", "transfer-encoding", "upgrade", "forwarded", "x-forwarded-for",
           "x-forwarded-host", "x-forwarded-proto", "x-user-id", "x-user-role", "cookie"]

def load_local_env(env):
    """Read optional gateway .env; process environment takes precedence."""
    result = dict(env)
    path = Path(__file__).resolve().parent.parent / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            match = re.fullmatch(r"(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)", line)
            if not match:
                raise ValueError("Invalid gateway .env assignment")
            name, value = match.groups()
            if value.startswith(('"', "'")):
                quote = value[0]
                end = value.rfind(quote)
                tail = value[end + 1:].strip()
                if end == 0 or (tail and not tail.startswith("#")):
                    raise ValueError("Invalid quoted gateway .env value")
                value = value[1:end]
            else:
                value = value.split("#", 1)[0].strip()
            result.setdefault(name, value)
    return result

def origin(value):
    url = urlsplit(value)
    if (url.scheme not in ("http", "https") or not url.hostname or url.username or
            url.password or url.path not in ("", "/") or url.query or url.fragment):
        raise ValueError("Service URLs must be HTTP(S) origins without credentials")
    return url

def cluster(name, urls):
    endpoints = []
    parsed = [origin(url) for url in urls]
    if len({url.scheme for url in parsed}) != 1:
        raise ValueError("A cluster must use one transport scheme")
    for url in parsed:
        endpoints.append({"endpoint": {"address": {"socket_address": {
            "address": url.hostname, "port_value": url.port or (443 if url.scheme == "https" else 80)}}}})
    result = {"name": name, "type": "STRICT_DNS", "connect_timeout": "3s",
              "lb_policy": "ROUND_ROBIN", "load_assignment": {
                  "cluster_name": name, "endpoints": [{"lb_endpoints": endpoints}]}}
    if parsed[0].scheme == "https":
        if len({url.hostname for url in parsed}) != 1:
            raise ValueError("HTTPS replica endpoints must share a hostname")
        result["transport_socket"] = {"name": "envoy.transport_sockets.tls", "typed_config": {
            "@type": TYPE + "envoy.extensions.transport_sockets.tls.v3.UpstreamTlsContext",
            "sni": parsed[0].hostname, "common_tls_context": {"validation_context": {
                "trusted_ca": {"filename": "/etc/ssl/certs/ca-certificates.crt"},
                "match_typed_subject_alt_names": [{"san_type": "DNS", "matcher": {
                    "exact": parsed[0].hostname}}]}}}}
    return result

def configuration(env):
    port = int(env.get("GATEWAY_PORT", "3003"))
    if not 1 <= port <= 65535:
        raise ValueError("GATEWAY_PORT must be between 1 and 65535")
    user = env["USER_SERVICE_URL"]
    supplier = env["SUPPLIER_SERVICE_URL"]
    origin(user)
    origin(supplier)
    auth = env.get("GATEWAY_AUTH_PREFIX", "/auth")
    locations = env.get("GATEWAY_LOCATIONS_PREFIX", "/locations")
    for prefix in (auth, locations):
        if not re.fullmatch(r"/[a-zA-Z0-9/-]+", prefix) or (len(prefix) > 1 and prefix.endswith("/")):
            raise ValueError("Invalid gateway route prefix")
    if auth == locations or auth.startswith(locations + "/") or locations.startswith(auth + "/"):
        raise ValueError("Gateway route prefixes must not overlap")
    jwks = env.get("USER_SERVICE_JWKS_URL") or urljoin(user, "/.well-known/jwks.json")
    key_url = urlsplit(jwks)
    key_origin = f"{key_url.scheme}://{key_url.netloc}"
    origin(key_origin)
    if key_url.fragment:
        raise ValueError("JWKS URL cannot contain a fragment")

    routes = []
    def route(method, path, service, public=False, regex=False):
        match = {"headers": [{"name": ":method", "string_match": {"exact": method}}]}
        match["safe_regex" if regex else "path"] = {"regex": path} if regex else path
        routes.append({"match": match, "route": {"cluster": service,
            "timeout": "0s", "idle_timeout": "10s", "auto_host_rewrite": True},
            "typed_per_filter_config": {JWT: {"@type": TYPE +
                "envoy.extensions.filters.http.jwt_authn.v3.PerRouteConfig",
                **({"disabled": True} if public else {"requirement_name": "user_token"})}}})
    public_paths = ["register", "register/verify", "register/resend-otp", "login", "refresh",
                    "password/forgot", "password/reset"]
    route("GET", "/.well-known/jwks.json", "user", True)
    for path in public_paths:
        route("POST", auth + "/" + path, "user", True)
    route("POST", auth + "/logout", "user")
    for method in ("GET", "PATCH"):
        route(method, "/users/me", "user")
    for path in ("otp", "email", "email/verify", "password", "deactivate"):
        route("POST", "/users/me/" + path, "user")
    route("PATCH", "/users/me/mobile", "user")
    route("GET", "/admin/users", "user")
    route("PATCH", r"/admin/users/[^/]+/role", "user", regex=True)
    route("POST", r"/admin/users/[^/]+/reactivate", "user", regex=True)
    route("GET", "/location-types", "supplier")
    for method in ("GET", "POST"):
        route(method, locations, "supplier")
    for method in ("GET", "PATCH"):
        route(method, re.escape(locations) + r"/[^/]+", "supplier", regex=True)
    for suffix in ("deactivate", "restore"):
        route("POST", re.escape(locations) + r"/[^/]+/" + suffix, "supplier", regex=True)
    routes.insert(0, {"match": {"path": "/health", "headers": [{"name": ":method",
        "string_match": {"exact": "GET"}}]}, "direct_response": {"status": 200,
        "body": {"inline_string": '{"status":"ok"}'}}, "response_headers_to_add": [{
            "header": {"key": "content-type", "value": "application/json"}}],
        "typed_per_filter_config": {JWT: {"@type": TYPE +
            "envoy.extensions.filters.http.jwt_authn.v3.PerRouteConfig", "disabled": True}}})
    routes.append({"match": {"prefix": "/"}, "direct_response": {"status": 404,
        "body": {"inline_string": '{"error":"Not found"}'}},
        "response_headers_to_add": [{"header": {"key": "content-type", "value": "application/json"}}],
        "typed_per_filter_config": {JWT: {"@type": TYPE +
            "envoy.extensions.filters.http.jwt_authn.v3.PerRouteConfig", "disabled": True}}})
    provider = {"from_headers": [{"name": "Authorization", "value_prefix": "Bearer "}],
                "forward": True, "require_expiration": True,
                "remote_jwks": {"http_uri": {"uri": jwks, "cluster": "jwks", "timeout": "3s"},
                                "cache_duration": "60s"}}
    if env.get("GATEWAY_JWT_ISSUER"):
        provider["issuer"] = env["GATEWAY_JWT_ISSUER"]
    if env.get("GATEWAY_JWT_AUDIENCE"):
        provider["audiences"] = [env["GATEWAY_JWT_AUDIENCE"]]
    lua = Path(__file__).with_name("compatibility.lua").read_text()
    logs = {"event": "request_completed", "requestId": "%REQ(X-REQUEST-ID)%",
            "method": "%REQ(:METHOD)%", "service": "%UPSTREAM_CLUSTER%", "status": "%RESPONSE_CODE%",
            "durationMs": "%DURATION%", "path": "%DYNAMIC_METADATA(foc:path)%"}
    hcm = {"@type": TYPE + "envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
        "stat_prefix": "foc", "normalize_path": False, "merge_slashes": False,
        "always_set_request_id_in_response": True,
        "http_protocol_options": {"allow_absolute_url": False},
        "route_config": {"name": "foc_routes", "virtual_hosts": [{"name": "foc", "domains": ["*"],
            "routes": routes}]},
        "http_filters": [
            {"name": "envoy.filters.http.lua", "typed_config": {"@type": TYPE +
                "envoy.extensions.filters.http.lua.v3.Lua", "clear_route_cache": False,
                "default_source_code": {"inline_string": lua}}},
            {"name": JWT, "typed_config": {"@type": TYPE +
                "envoy.extensions.filters.http.jwt_authn.v3.JwtAuthentication",
                "providers": {"foc_user": provider}, "requirement_map": {"user_token": {
                    "provider_name": "foc_user"}}}},
            {"name": "envoy.filters.http.router", "typed_config": {"@type": TYPE +
                "envoy.extensions.filters.http.router.v3.Router"}}],
        "access_log": [{"name": "envoy.access_loggers.stdout", "typed_config": {
            "@type": TYPE + "envoy.extensions.access_loggers.stream.v3.StdoutAccessLog",
            "log_format": {"json_format": logs}}}]}
    for event, code in [("unauthorized_access", 401), ("unauthorized_access", 403)]:
        hcm["access_log"].append({"name": "envoy.access_loggers.stdout", "filter": {
            "status_code_filter": {"comparison": {"op": "EQ", "value": {"default_value": code}}}},
            "typed_config": {"@type": TYPE + "envoy.extensions.access_loggers.stream.v3.StdoutAccessLog",
                "log_format": {"json_format": {**logs, "event": event}}}})
    # Multiple endpoints are exposed only through explicit test configuration.
    replicas = json.loads(env.get("FOC_TEST_SUPPLIER_URLS") or "null") or [supplier]
    return {"static_resources": {"listeners": [{"name": "gateway", "address": {
        "socket_address": {"address": "0.0.0.0", "port_value": port}}, "filter_chains": [{
            "filters": [{"name": "envoy.filters.network.http_connection_manager", "typed_config": hcm}]}]}],
        "clusters": [cluster("user", [user]), cluster("supplier", replicas), cluster("jwks", [key_origin])]}}

if __name__ == "__main__":
    try:
        output = sys.argv[1] if len(sys.argv) > 1 else "/tmp/foc-envoy.json"
        Path(output).write_text(json.dumps(configuration(load_local_env(os.environ)), indent=2))
        if "--exec" in sys.argv:
            os.execv("/usr/local/bin/envoy", ["envoy", "-c", output, "--log-level", "warning", "--concurrency", "2"])
    except (ValueError, KeyError) as error:
        sys.exit(f"Invalid gateway configuration: {error}")
