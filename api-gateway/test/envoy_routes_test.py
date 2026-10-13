"""AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Verify route-file discovery and rejection of malformed authentication configuration.
Author review: Pending human review.
"""
# AI-generated; review pending.
import importlib.util
import json
from pathlib import Path
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
        self.env = {"USER_SERVICE_URL": "http://user:3001", "SUPPLIER_SERVICE_URL": "http://supplier:3002"}

    def write_service(self, definition):
        (self.root / "routes" / "30-extra.routes.json").write_text(json.dumps(definition))

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


if __name__ == "__main__":
    unittest.main()
