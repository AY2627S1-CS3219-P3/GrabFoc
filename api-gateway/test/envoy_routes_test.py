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
        spec = importlib.util.spec_from_file_location("isolated_renderer", self.root / "render.py")
        self.renderer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.renderer)
        self.env = {"USER_SERVICE_URL": "http://user:3001", "SUPPLIER_SERVICE_URL": "http://supplier:3002",
                    "ORDER_SERVICE_URL": "http://order:3005", "CREDIT_SERVICE_URL": "http://credit:3004"}

    def write_service(self, definition):
        (self.root / "routes" / "30-extra.routes.json").write_text(json.dumps(definition))

    def test_credit_routes_expose_only_balance_and_history_reads(self):
        config = self.renderer.configuration(self.env)
        hcm = config["static_resources"]["listeners"][0]["filter_chains"][0]["filters"][0]["typed_config"]
        routes = [r for r in hcm["route_config"]["virtual_hosts"][0]["routes"]
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
        routes = [r for r in hcm["route_config"]["virtual_hosts"][0]["routes"]
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
