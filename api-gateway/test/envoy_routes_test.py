"""AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Verify route-file discovery, malformed authentication configuration, and environment-configurable Envoy settings.
Author review: Pending human review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-26
Scope: Added test_upstreams_prefer_ipv4 (first AWS staging deploy).
Author review: Pending Jie Yang's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added ORDER_SERVICE_URL to the base environment and a check that the Order routes render as protected routes to the order cluster.
Author review: Pending review by Deanson.
Scope: Added CREDIT_SERVICE_URL to the test environment and a test that only Credit's balance and
history reads are routed, with JWT required (#61).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
Scope: Tests that the internal listener accepts /gateway/* and never routes /gateway/internal; the Order
and Credit count tests now count unprefixed routes (#141).
Scope: Tests for the edge listener: off by default, startup validation, origin-key match on every route,
frontend catch-all without host rewrite (#141).
Author review: Pending Jie Yang's review.
"""
# AI-generated; review pending.
import importlib.util
import json
from pathlib import Path
import re
import shutil
import tempfile
import unittest


class RouteFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        source = Path(__file__).resolve().parents[1] / "envoy"
        shutil.copytree(source / "routes", self.root / "routes")
        shutil.copy(source / "render.py", self.root)
        shutil.copy(source / "compatibility.lua", self.root)
        shutil.copy(source / "frontend.lua", self.root)
        spec = importlib.util.spec_from_file_location("isolated_renderer", self.root / "render.py")
        self.renderer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.renderer)
        self.env = {"USER_SERVICE_URL": "http://user:3001", "SUPPLIER_SERVICE_URL": "http://supplier:3002",
                    "ORDER_SERVICE_URL": "http://order:3005", "CREDIT_SERVICE_URL": "http://credit:3004"}

    def write_service(self, definition):
        (self.root / "routes" / "30-extra.routes.json").write_text(json.dumps(definition))

    # AI-generated (Claude Code, 2026-10-27; pending review by Jie Yang)
    @staticmethod
    def routes(config, listener=0):
        hcm = config["static_resources"]["listeners"][listener]["filter_chains"][0]["filters"][0]["typed_config"]
        return hcm["route_config"]["virtual_hosts"][0]["routes"]

    @staticmethod
    def unprefixed(routes):
        """The service routes without their /gateway copies."""
        return [r for r in routes if not (r["match"].get("path") or
                r["match"].get("safe_regex", {}).get("regex", "")).startswith("/gateway")]

    def test_internal_listener_accepts_gateway_prefix(self):
        routes = self.routes(self.renderer.configuration(self.env))
        jwks = [r for r in routes if r["match"].get("path") == "/gateway/.well-known/jwks.json"]
        self.assertEqual(len(jwks), 1)
        self.assertEqual(jwks[0]["route"]["regex_rewrite"]["substitution"], "")
        self.assertTrue(any(r["match"].get("path") == "/.well-known/jwks.json" for r in routes))

    @property
    def edge_env(self):
        return {**self.env, "GATEWAY_EDGE_PORT": "8080", "GATEWAY_ORIGIN_KEY": "k" * 32,
                "FRONTEND_URL": "http://frontend:3000"}

    def test_no_edge_listener_without_edge_port(self):
        config = self.renderer.configuration(self.env)
        self.assertEqual(len(config["static_resources"]["listeners"]), 1)
        self.assertNotIn("frontend", [c["name"] for c in config["static_resources"]["clusters"]])

    def test_edge_listener_requires_origin_key_and_frontend(self):
        for missing in ("GATEWAY_ORIGIN_KEY", "FRONTEND_URL"):
            env = dict(self.edge_env)
            del env[missing]
            with self.subTest(missing=missing), self.assertRaises(ValueError):
                self.renderer.configuration(env)
        for bad in ({"GATEWAY_ORIGIN_KEY": "short"}, {"GATEWAY_EDGE_PORT": "3003"},
                    {"GATEWAY_EDGE_PORT": "0"}, {"FRONTEND_URL": "http://frontend:3000/app"}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.renderer.configuration({**self.edge_env, **bad})

    def test_edge_page_paths_reach_frontend(self):
        config = self.renderer.configuration(self.edge_env)
        listener = config["static_resources"]["listeners"][1]
        self.assertEqual(listener["address"]["socket_address"]["port_value"], 8080)
        routes = self.routes(config, listener=1)
        frontend = [r for r in routes if r.get("route", {}).get("cluster") == "frontend"]
        self.assertEqual(len(frontend), 1)
        self.assertNotIn("auto_host_rewrite", frontend[0]["route"])
        self.assertEqual(frontend[0]["match"]["prefix"], "/")
        self.assertIn("frontend", [c["name"] for c in config["static_resources"]["clusters"]])
        paths = [r["match"].get("path") for r in routes]
        self.assertNotIn("/orders", paths)  # API routes exist only under /gateway
        self.assertNotIn("/health", paths)
        self.assertIn("/gateway/orders", paths)
        self.assertEqual(routes[-1]["direct_response"]["status"], 403)
        for route in routes[:-1]:
            with self.subTest(route=route["match"]):
                self.assertIn({"name": "x-origin-key", "string_match": {"exact": "k" * 32}},
                              route["match"]["headers"])
        hcm = listener["filter_chains"][0]["filters"][0]["typed_config"]
        self.assertEqual(hcm["route_config"]["request_headers_to_remove"], ["x-origin-key"])

    def test_gateway_health_on_both_listeners(self):
        config = self.renderer.configuration(self.edge_env)
        for listener in (0, 1):
            with self.subTest(listener=listener):
                health = [r for r in self.routes(config, listener) if r["match"].get("path") == "/gateway/health"]
                self.assertEqual(len(health), 1)
                self.assertEqual(health[0]["direct_response"]["status"], 200)
        edge = next(r for r in self.routes(config, 1) if r["match"].get("path") == "/gateway/health")
        self.assertIn("x-origin-key", [h["name"] for h in edge["match"]["headers"]])

    def test_gateway_prefix_never_routes_internal_paths(self):
        routes = self.routes(self.renderer.configuration(self.env))
        patterns = [r["match"]["safe_regex"]["regex"] for r in routes if "safe_regex" in r["match"]]
        paths = [r["match"]["path"] for r in routes if "path" in r["match"]]
        self.assertTrue(any(p.startswith("/gateway/") for p in patterns))
        for path in ("/gateway/internal/credits/reserve", "/gateway/admin/credits/dead-letters"):
            with self.subTest(path=path):
                self.assertFalse(any(re.fullmatch(p, path) for p in patterns))
                self.assertNotIn(path, paths)

    def test_credit_routes_expose_only_balance_and_history_reads(self):
        config = self.renderer.configuration(self.env)
        hcm = config["static_resources"]["listeners"][0]["filter_chains"][0]["filters"][0]["typed_config"]
        routes = [r for r in self.unprefixed(hcm["route_config"]["virtual_hosts"][0]["routes"])
                  if r.get("route", {}).get("cluster") == "credit"]
        self.assertEqual(len(routes), 2)
        for route in routes:
            self.assertEqual(route["match"]["headers"][0]["string_match"]["exact"], "GET")
            self.assertEqual(route["typed_per_filter_config"][self.renderer.JWT]["requirement_name"], "user_token")
        patterns = [route["match"]["safe_regex"]["regex"] for route in routes]
        routed = lambda path: any(re.fullmatch(pattern, path) for pattern in patterns)
        user = "780419c1-46d6-4046-8f8c-73851d35c07e"
        self.assertTrue(routed(f"/credits/{user}"))
        self.assertTrue(routed(f"/credits/{user}/transactions"))
        for path in ("/credits", "/internal/credits/reserve", "/admin/credits/dead-letters",
                     f"/credits/{user}/transactions/extra"):
            with self.subTest(path=path):
                self.assertFalse(routed(path))

    def test_new_file_adds_upstream_and_protected_route(self):
        self.write_service({"service": "extra", "urlEnv": "EXTRA_SERVICE_URL",
                            "routes": [{"method": "GET", "path": "/example"}]})
        config = self.renderer.configuration({**self.env, "EXTRA_SERVICE_URL": "http://extra:3010"})
        resources = config["static_resources"]
        upstream = next(c for c in resources["clusters"] if c["name"] == "extra")
        endpoint = upstream["load_assignment"]["endpoints"][0]["lb_endpoints"][0]["endpoint"]
        self.assertEqual(endpoint["address"]["socket_address"], {"address": "extra", "port_value": 3010})
        hcm = resources["listeners"][0]["filter_chains"][0]["filters"][0]["typed_config"]
        routes = hcm["route_config"]["virtual_hosts"][0]["routes"]
        route = next(r for r in routes if r["match"].get("path") == "/example")
        self.assertEqual(route["route"]["cluster"], "extra")
        self.assertEqual(route["typed_per_filter_config"][self.renderer.JWT]["requirement_name"], "user_token")
        self.assertEqual(routes[-1]["direct_response"]["status"], 404)

    # AI-generated (Claude Code, 2026-10-26; pending review by Jie Yang). On ECS, Service Connect lists
    # an IPv6 address next to each service's IPv4 one; Envoy's default lookup prefers IPv6, which
    # nothing serves there, so every upstream call failed (first staging deploy, deploy part 2).
    def test_upstreams_prefer_ipv4(self):
        config = self.renderer.configuration(self.env)
        clusters = config["static_resources"]["clusters"]
        dns = [c for c in clusters if c.get("type") in ("STRICT_DNS", "LOGICAL_DNS")]
        self.assertTrue(dns)
        for cluster in dns:
            with self.subTest(cluster=cluster["name"]):
                self.assertEqual(cluster.get("dns_lookup_family"), "V4_PREFERRED")

    # AI-generated (Claude Code, 2026-10-22; pending review by Deanson)
    def test_order_routes_are_protected_and_never_internal(self):
        config = self.renderer.configuration(self.env)
        resources = config["static_resources"]
        hcm = resources["listeners"][0]["filter_chains"][0]["filters"][0]["typed_config"]
        routes = [r for r in self.unprefixed(hcm["route_config"]["virtual_hosts"][0]["routes"])
                  if r.get("route", {}).get("cluster") == "order"]
        self.assertEqual(len(routes), 14)
        for route in routes:
            self.assertEqual(route["typed_per_filter_config"][self.renderer.JWT]["requirement_name"], "user_token")
            path = route["match"].get("path") or route["match"]["safe_regex"]["regex"]
            self.assertTrue(path.startswith("/orders"))
        static = [r["match"]["path"] for r in routes if "path" in r["match"]]
        self.assertEqual(static, ["/orders/available", "/orders/mine", "/orders/assigned", "/orders"])
        order = next(c for c in resources["clusters"] if c["name"] == "order")
        endpoint = order["load_assignment"]["endpoints"][0]["lb_endpoints"][0]["endpoint"]
        self.assertEqual(endpoint["address"]["socket_address"], {"address": "order", "port_value": 3005})

    def test_invalid_definitions_fail_instead_of_disabling_authentication(self):
        valid = {"service": "extra", "urlEnv": "EXTRA_SERVICE_URL",
                 "routes": [{"method": "GET", "path": "/example"}]}
        entries = [
            {"method": "GET", "path": "/example", "public": "false"},
            {"method": "GET", "path": "/example", "publik": True},
            {"method": "GET", "path": "/example", "regex": "/.*"},
            {"method": "GET", "path": "{unknown}/example"},
        ]
        for entry in entries:
            with self.subTest(entry=entry):
                self.write_service({**valid, "routes": [entry]})
                with self.assertRaises(ValueError):
                    self.renderer.configuration({**self.env, "EXTRA_SERVICE_URL": "http://extra:3010"})
        self.write_service({**valid, "service": "user"})
        with self.assertRaises(ValueError):
            self.renderer.configuration(self.env)

    def test_infrastructure_settings_keep_defaults_and_accept_overrides(self):
        base = self.renderer.configuration(self.env)
        clusters = base["static_resources"]["clusters"]
        self.assertTrue(all(c["lb_policy"] == "ROUND_ROBIN" and
                            c["connect_timeout"] == "3s" for c in clusters))
        override = {**self.env, "GATEWAY_LB_POLICY": "LEAST_REQUEST",
                    "GATEWAY_CONNECT_TIMEOUT": "500ms", "GATEWAY_ROUTE_TIMEOUT": "5s",
                    "GATEWAY_ROUTE_IDLE_TIMEOUT": "30s", "GATEWAY_JWKS_FETCH_TIMEOUT": "1s",
                    "GATEWAY_JWKS_CACHE_DURATION": "120s", "GATEWAY_WORKERS": "4"}
        config = self.renderer.configuration(override)
        resources = config["static_resources"]
        self.assertTrue(all(c["lb_policy"] == "LEAST_REQUEST" and
                            c["connect_timeout"] == "0.5s" for c in resources["clusters"]))
        hcm = resources["listeners"][0]["filter_chains"][0]["filters"][0]["typed_config"]
        user_route = next(r for r in hcm["route_config"]["virtual_hosts"][0]["routes"]
                          if r.get("route"))
        self.assertEqual(user_route["route"]["timeout"], "5s")
        self.assertEqual(user_route["route"]["idle_timeout"], "30s")
        jwks = hcm["http_filters"][1]["typed_config"]["providers"]["foc_user"]["remote_jwks"]
        self.assertEqual(jwks["http_uri"]["timeout"], "1s")
        self.assertEqual(jwks["cache_duration"], "120s")
        self.assertEqual(self.renderer.infrastructure_settings(override)["workers"], "4")

    def test_invalid_infrastructure_settings_fail_at_startup(self):
        for name, value in (("GATEWAY_LB_POLICY", "INVALID"),
                            ("GATEWAY_CONNECT_TIMEOUT", "0s"),
                            ("GATEWAY_ROUTE_TIMEOUT", "forever"),
                            ("GATEWAY_ROUTE_IDLE_TIMEOUT", "-1s"),
                            ("GATEWAY_JWKS_FETCH_TIMEOUT", "0s"),
                            ("GATEWAY_JWKS_CACHE_DURATION", "0s"),
                            ("GATEWAY_WORKERS", "0")):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    self.renderer.configuration({**self.env, name: value})


if __name__ == "__main__":
    unittest.main()
