"""AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Render route files, expose JWT failure metadata, and read existing Envoy infrastructure settings from environment variables.
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

def infrastructure_settings(env):
    policy = env.get("GATEWAY_LB_POLICY", "ROUND_ROBIN")
    if policy not in {"ROUND_ROBIN", "LEAST_REQUEST", "RANDOM"}:
        raise ValueError("GATEWAY_LB_POLICY must be ROUND_ROBIN, LEAST_REQUEST, or RANDOM")
    settings = {"lb_policy": policy}
    for name, default, allow_zero in (
            ("GATEWAY_CONNECT_TIMEOUT", "3s", False),
            ("GATEWAY_ROUTE_TIMEOUT", "0s", True),
            ("GATEWAY_ROUTE_IDLE_TIMEOUT", "10s", False),
            ("GATEWAY_JWKS_FETCH_TIMEOUT", "3s", False),
            ("GATEWAY_JWKS_CACHE_DURATION", "60s", False)):
        value = env.get(name, default)
        match = re.fullmatch(r"(0|[1-9][0-9]*)(ms|s|m)", value)
        if not match or (int(match[1]) == 0 and not allow_zero):
            raise ValueError(f"{name} must be a positive duration (ms, s, m)" +
                             (" or 0s" if allow_zero else ""))
        amount, unit = int(match[1]), match[2]
        if unit == "ms":
            seconds = f"{amount // 1000}.{amount % 1000:03d}".rstrip("0").rstrip(".")
            settings[name] = f"{seconds}s"
        else:
            settings[name] = f"{amount * (60 if unit == 'm' else 1)}s"
    workers = env.get("GATEWAY_WORKERS", "2")
    if not re.fullmatch(r"[1-9][0-9]*", workers) or int(workers) > 64:
        raise ValueError("GATEWAY_WORKERS must be between 1 and 64")
    settings["workers"] = workers
    return settings

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

def cluster(name, urls, settings):
    endpoints = []
    parsed = [origin(url) for url in urls]
    if len({url.scheme for url in parsed}) != 1:
        raise ValueError("A cluster must use one transport scheme")
    for url in parsed:
        endpoints.append({"endpoint": {"address": {"socket_address": {
            "address": url.hostname, "port_value": url.port or (443 if url.scheme == "https" else 80)}}}})
    result = {"name": name, "type": "STRICT_DNS", "connect_timeout": settings["GATEWAY_CONNECT_TIMEOUT"],
              "lb_policy": settings["lb_policy"], "load_assignment": {
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

def load_routes(env):
    """Load service files in filename order; reject invalid configuration at startup."""
    files = sorted(Path(__file__).with_name("routes").glob("*.routes.json"))
    if not files:
        raise ValueError("No service route files found")
    services, prefixes, names = [], {}, {"jwks"}
    for file in files:
        definition = json.loads(file.read_text(encoding="utf-8"))
        if not isinstance(definition, dict) or set(definition) - {
                "_disclosure", "service", "urlEnv", "prefixes", "routes"}:
            raise ValueError(f"Invalid service definition: {file.name}")
        name = definition.get("service", "")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*", name) or name in names:
            raise ValueError(f"Invalid or duplicate service name: {file.name}")
        names.add(name)
        url_env = definition.get("urlEnv", "")
        if not isinstance(url_env, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]*", url_env):
            raise ValueError(f"Invalid URL variable: {file.name}")
        origin(env[url_env])
        specs = definition.get("prefixes", {})
        if not isinstance(specs, dict):
            raise ValueError(f"Invalid prefixes: {file.name}")
        for key, spec in specs.items():
            if (not re.fullmatch(r"[a-z][a-z0-9_]*", key) or key in prefixes or
                    not isinstance(spec, dict) or set(spec) != {"env", "default"} or
                    not isinstance(spec["env"], str) or
                    not re.fullmatch(r"[A-Z][A-Z0-9_]*", spec["env"]) or
                    not isinstance(spec["default"], str)):
                raise ValueError(f"Invalid prefix definition: {file.name}")
            value = env.get(spec["env"], spec["default"])
            if (not re.fullmatch(r"/[a-zA-Z0-9/-]+", value) or
                    (len(value) > 1 and value.endswith("/"))):
                raise ValueError("Invalid gateway route prefix")
            prefixes[key] = value
        entries = definition.get("routes")
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"Missing service routes: {file.name}")
        services.append(definition)
    values = list(prefixes.values())
    for index, value in enumerate(values):
        for other in values[index + 1:]:
            if value == other or value.startswith(other + "/") or other.startswith(value + "/"):
                raise ValueError("Gateway route prefixes must not overlap")
    for definition in services:
        for entry in definition["routes"]:
            if (not isinstance(entry, dict) or set(entry) - {"method", "path", "regex", "public"} or
                    entry.get("method") not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"} or
                    (("path" in entry) == ("regex" in entry)) or
                    type(entry.get("public", False)) is not bool):
                raise ValueError(f"Invalid route entry for {definition['service']}")
            path = entry.get("path", entry.get("regex"))
            if not isinstance(path, str) or not path:
                raise ValueError("Route path must be a nonempty string")
            for key in re.findall(r"\{([a-z][a-z0-9_]*)\}", path):
                if key not in prefixes:
                    raise ValueError(f"Unknown route prefix: {key}")
    if "user" not in names:
        raise ValueError("User service routes are required for JWT key discovery")
    return services, prefixes


def configuration(env):
    settings = infrastructure_settings(env)
    port = int(env.get("GATEWAY_PORT", "3003"))
    if not 1 <= port <= 65535:
        raise ValueError("GATEWAY_PORT must be between 1 and 65535")
    services, prefixes = load_routes(env)
    user = next(env[item["urlEnv"]] for item in services if item["service"] == "user")
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
            "timeout": settings["GATEWAY_ROUTE_TIMEOUT"],
            "idle_timeout": settings["GATEWAY_ROUTE_IDLE_TIMEOUT"], "auto_host_rewrite": True},
            "typed_per_filter_config": {JWT: {"@type": TYPE +
                "envoy.extensions.filters.http.jwt_authn.v3.PerRouteConfig",
                **({"disabled": True} if public else {"requirement_name": "user_token"})}}})
    for definition in services:
        for entry in definition["routes"]:
            regex = "regex" in entry
            path = entry["regex" if regex else "path"]
            values = {key: re.escape(value) if regex else value
                      for key, value in prefixes.items()}
            path = re.sub(r"\{([a-z][a-z0-9_]*)\}", lambda m: values[m[1]], path)
            route(entry["method"], path, definition["service"],
                  public=entry.get("public", False), regex=regex)
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
                "failed_status_in_metadata": "verification_failure",
                "remote_jwks": {"http_uri": {"uri": jwks, "cluster": "jwks",
                                              "timeout": settings["GATEWAY_JWKS_FETCH_TIMEOUT"]},
                                "cache_duration": settings["GATEWAY_JWKS_CACHE_DURATION"]}}
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
    upstreams = []
    for definition in services:
        urls = [env[definition["urlEnv"]]]
        if definition["service"] == "supplier":
            urls = json.loads(env.get("FOC_TEST_SUPPLIER_URLS") or "null") or urls
        upstreams.append(cluster(definition["service"], urls, settings))
    return {"static_resources": {"listeners": [{"name": "gateway", "address": {
        "socket_address": {"address": "0.0.0.0", "port_value": port}}, "filter_chains": [{
            "filters": [{"name": "envoy.filters.network.http_connection_manager", "typed_config": hcm}]}]}],
        "clusters": upstreams + [cluster("jwks", [key_origin], settings)]}}

if __name__ == "__main__":
    try:
        output = sys.argv[1] if len(sys.argv) > 1 else "/tmp/foc-envoy.json"
        env = load_local_env(os.environ)
        Path(output).write_text(json.dumps(configuration(env), indent=2))
        if "--exec" in sys.argv:
            os.execv("/usr/local/bin/envoy", ["envoy", "-c", output, "--log-level", "warning",
                                                "--concurrency", infrastructure_settings(env)["workers"]])
    except (ValueError, KeyError) as error:
        sys.exit(f"Invalid gateway configuration: {error}")
