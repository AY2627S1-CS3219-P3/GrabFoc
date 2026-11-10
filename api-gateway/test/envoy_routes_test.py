"""AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Verify route-file discovery, malformed authentication configuration, and environment-configurable Envoy settings.
Author review: Pending human review.
# AI-generated (Claude Code).
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
Author review (Jian Bing, 2026-11-07): Looked through the code and think it's okay.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
Scope: Test that api-gateway/.env.example lists every variable the renderer and route files read (PR #156 review).
Author review (Jian Bing, 2026-11-07): Looked through the code and think it's okay.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
Scope: Counted the admin Order routes in the Order check and added a test that the admin dashboard's
User and Order reads reach the right service with JWT required, while /admin/credits stays unrouted (#182).
Author review: Reviewed by Zi Yi, 2026-11-07; pending review by Jie Yang.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Expect the new GET /orders/:orderId/history route (#184 review).
Author review: Reviewed by Zi Yi, 2026-11-07; pending Jie Yang's approval.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: CHAT_SERVICE_URL in the test environment; the chat-ticket Order route (19 routes); the
       "websocket" route field, WebSocket upgrades and the chat socket route (the chat plan).
Author review: Reviewed by Deanson, 2026-11-09; Jie Yang (gateway owner) to approve.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: LOGGING_SERVICE_URL in the test environment, and a test that the log store's query API is
       routed as one protected GET to the logging cluster and that nothing else of that service is
       reachable (#52).
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: the log route takes a fixed path, so the prefix-override case is gone; a test that
       api-gateway/.env.example works as written, which it did not; and a test that every route
       file's urlEnv is in the deployed task definition, which only the Terraform tests checked and
       only when infra changed.
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: no two routes may render the same matcher for one method. GATEWAY_LOCATIONS_PREFIX=
       /logs was accepted and sent log queries to the Supplier Service, which answers 200. A second
       round: compare what is rendered rather than whole prefix namespaces, so a prefix nested
       under a fixed path, or landing on one under another method, still works.
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Review: the /gateway copies count in the collision check, and /gateway is reserved - a
       prefix of /gateway/logs collided only in the copies, and /gateway alone was swallowed by a
       regex route the duplicate check cannot see.
Author review: pending - Jie Yang owns the gateway's route files.
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
                    "ORDER_SERVICE_URL": "http://order:3005", "CREDIT_SERVICE_URL": "http://credit:3004",
                    "CHAT_SERVICE_URL": "http://chat:3007",
                    "LOGGING_SERVICE_URL": "http://logging:3006"}

    def write_service(self, definition):
        (self.root / "routes" / "30-extra.routes.json").write_text(json.dumps(definition))

    # AI-generated (Claude Code, 2026-10-27)
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
        self.assertEqual(route["route"]["idle_timeout"], "10s")  # no "websocket": the global default
        self.assertEqual(routes[-1]["direct_response"]["status"], 404)

    # AI-generated (Claude Code).
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
        self.assertEqual(len(routes), 19)
        for route in routes:
            self.assertEqual(route["typed_per_filter_config"][self.renderer.JWT]["requirement_name"], "user_token")
            path = route["match"].get("path") or route["match"]["safe_regex"]["regex"]
            self.assertTrue(path.startswith(("/orders", "/admin/orders")))
        static = [r["match"]["path"] for r in routes if "path" in r["match"]]
        self.assertEqual(static, ["/orders/available", "/orders/mine", "/orders/assigned", "/orders",
                                  "/admin/orders", "/admin/orders/overview"])
        history = [r for r in routes if r["match"].get("safe_regex", {}).get("regex") == "/orders/[^/]+/history"]
        self.assertEqual([r["match"]["headers"][0]["string_match"]["exact"] for r in history], ["GET"])
        order = next(c for c in resources["clusters"] if c["name"] == "order")
        endpoint = order["load_assignment"]["endpoints"][0]["lb_endpoints"][0]["endpoint"]
        self.assertEqual(endpoint["address"]["socket_address"], {"address": "order", "port_value": 3005})

    # AI-generated (Claude Code, 2026-11-08; pending review by Jie Yang)
    def test_access_log_matches_the_log_store_shape(self):
        """The gateway's line reads like every service's, so collecting it needs no mapping."""
        config = self.renderer.configuration(self.env)
        hcm = (config["static_resources"]["listeners"][0]["filter_chains"][0]
               ["filters"][0]["typed_config"])
        logs = hcm["access_log"]
        base = logs[0]["typed_config"]["log_format"]["json_format"]
        # The field names the Logging Service stores. lineId is absent on purpose: Envoy has no
        # UUID source, and one request can emit two of these entries, so whatever collects this
        # stdout has to mint it.
        self.assertEqual(set(base), {"event", "level", "ts", "requestId", "method", "service",
                                     "upstream", "status", "durationMs", "path"})
        self.assertEqual(base["event"], "request_completed")
        self.assertEqual(base["level"], "info")
        self.assertEqual(base["ts"], "%START_TIME(%Y-%m-%dT%H:%M:%S.%3fZ)%")
        self.assertNotIn("lineId", base)
        # `service` is this gateway, as a literal, not %UPSTREAM_CLUSTER%: the store requires a
        # service and refuses the whole line when one is null, which the operator renders for a
        # request that reaches no upstream. The upstream keeps its own field.
        self.assertEqual(base["service"], "gateway")
        self.assertEqual(base["upstream"], "%UPSTREAM_CLUSTER%")
        # Left as plain operators on purpose: this Envoy renders a value that is exactly one
        # operator with the operator's own type, so these arrive as JSON numbers, which is what
        # the store requires. Checked by running Envoy, not from the documentation.
        self.assertEqual(base["status"], "%RESPONSE_CODE%")
        self.assertEqual(base["durationMs"], "%DURATION%")
        # An outcome worth finding on its own gets its own entry, with its own event and level -
        # level cannot be derived from the status inside a json_format.
        outcomes = []
        for entry in logs[1:]:
            fmt = entry["typed_config"]["log_format"]["json_format"]
            comparison = entry["filter"]["status_code_filter"]["comparison"]
            outcomes.append((fmt["event"], fmt["level"], comparison["op"],
                             comparison["value"]["default_value"]))
            # Same field set as the base line, whatever the outcome.
            self.assertEqual(set(fmt), set(base))
        self.assertEqual(outcomes, [("unauthorized_access", "warn", "EQ", 401),
                                    ("unauthorized_access", "warn", "EQ", 403),
                                    ("upstream_error", "error", "GE", 500)])

    # AI-generated (Claude Code, 2026-11-06; reviewed by Zi Yi, 2026-11-07; pending review by Jie Yang)
    def test_admin_dashboard_reads_reach_their_service_with_jwt(self):
        config = self.renderer.configuration(self.env)
        hcm = config["static_resources"]["listeners"][0]["filter_chains"][0]["filters"][0]["typed_config"]
        routes = hcm["route_config"]["virtual_hosts"][0]["routes"]

        def first_match(method, path):
            # Envoy uses the first route whose method and path match; safe_regex must match the whole path.
            return next(r for r in routes if r["match"].get("prefix") == "/" or (
                r["match"]["headers"][0]["string_match"]["exact"] == method and
                (r["match"].get("path") == path or
                 re.fullmatch(r["match"].get("safe_regex", {}).get("regex", "(?!)"), path))))

        user = "780419c1-46d6-4046-8f8c-73851d35c07e"
        for path, cluster in (("/admin/users/login-summary", "user"),
                              (f"/admin/users/{user}/login-events", "user"),
                              ("/admin/orders", "order"), ("/admin/orders/overview", "order"),
                              (f"/admin/orders/{user}/history", "order")):
            with self.subTest(path=path):
                route = first_match("GET", path)
                self.assertEqual(route["route"]["cluster"], cluster)
                self.assertEqual(route["typed_per_filter_config"][self.renderer.JWT]["requirement_name"],
                                 "user_token")
        for method, path in (("GET", "/admin/credits/dead-letters"), ("POST", "/admin/users/login-summary"),
                             ("GET", f"/admin/users/{user}/login-events/extra"), ("GET", f"/admin/orders/{user}"),
                             ("POST", "/admin/orders"), ("GET", f"/admin/orders/{user}/history/extra")):
            with self.subTest(method=method, path=path):
                self.assertEqual(first_match(method, path)["direct_response"]["status"], 404)

    # AI-generated (Claude Code, 2026-11-08): the chat plan
    def test_chat_socket_route_is_public_websocket_with_longer_idle_timeout(self):
        config = self.renderer.configuration({**self.env, **self.edge_env})
        for listener in (0, 1):
            hcm = config["static_resources"]["listeners"][listener]["filter_chains"][0]["filters"][0]["typed_config"]
            self.assertEqual(hcm["upgrade_configs"], [{"upgrade_type": "websocket"}])
        routes = self.routes(config)
        for path in ("/socket.io/", "/gateway/socket.io/"):
            with self.subTest(path=path):
                route = next(r for r in routes if r["match"].get("path") == path)
                self.assertEqual(route["route"]["cluster"], "chat")
                self.assertEqual(route["match"]["headers"][0]["string_match"]["exact"], "GET")
                self.assertTrue(route["typed_per_filter_config"][self.renderer.JWT]["disabled"])
                self.assertEqual(route["route"]["idle_timeout"], "60s")
        edge = next(r for r in self.routes(config, 1) if r["match"].get("path") == "/gateway/socket.io/")
        self.assertEqual(edge["route"]["idle_timeout"], "60s")
        others = [r for r in routes if "route" in r and r["route"]["cluster"] != "chat"]
        self.assertTrue(others)
        for route in others:
            self.assertEqual(route["route"]["idle_timeout"], "10s")
        chat = next(c for c in config["static_resources"]["clusters"] if c["name"] == "chat")
        endpoint = chat["load_assignment"]["endpoints"][0]["lb_endpoints"][0]["endpoint"]
        self.assertEqual(endpoint["address"]["socket_address"], {"address": "chat", "port_value": 3007})

    # AI-generated (Claude Code, 2026-11-09)
    def test_log_query_is_one_protected_route_to_the_logging_cluster(self):
        """The log store is an admin tool, so the gateway exposes exactly one read of it (#52).

        It must require a token - the service's own ADMIN check is what separates a USER from an
        admin, and that check never runs on a request the gateway has already let through
        unauthenticated. And it must be the query API only: the store's ingest is Kafka, so there
        is nothing else of this service a browser has any reason to reach.
        """
        config = self.renderer.configuration(self.env)
        routes = [r for r in self.unprefixed(self.routes(config))
                  if r.get("route", {}).get("cluster") == "logging"]
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0]["match"]["path"], "/logs")
        self.assertEqual(routes[0]["match"]["headers"][0]["string_match"]["exact"], "GET")
        # Not "disabled": an unauthenticated GET /logs would reach a handler whose only defence is
        # the role on a token that is not there.
        self.assertEqual(routes[0]["typed_per_filter_config"][self.renderer.JWT]["requirement_name"],
                         "user_token")
        # The /gateway copy strips the prefix, so the service still sees /logs.
        public = next(r for r in self.routes(config) if r["match"].get("path") == "/gateway/logs")
        self.assertEqual(public["route"]["cluster"], "logging")
        self.assertEqual(public["route"]["regex_rewrite"]["substitution"], "")
        cluster = next(c for c in config["static_resources"]["clusters"] if c["name"] == "logging")
        endpoint = cluster["load_assignment"]["endpoints"][0]["lb_endpoints"][0]["endpoint"]
        self.assertEqual(endpoint["address"]["socket_address"], {"address": "logging", "port_value": 3006})
        # Deliberately no prefix variable. A declared prefix renames only what Envoy matches - it
        # is not rewritten on the way out - so moving one sends a path the upstream does not serve
        # and every request 404s. That is a knob that looks adjustable and is not, which is worse
        # than a fixed path for a single admin endpoint (review).
        self.assertNotIn("logs", self.renderer.load_routes(self.env)[1])

    # AI-generated (Claude Code, 2026-11-09; review)
    def test_env_example_starts_the_gateway_as_written(self):
        """Copy api-gateway/.env.example to .env and the gateway must come up.

        load_local_env keeps a variable that is present and empty, while the renderer falls back to
        a default only when it is absent - so an example line left blank is not a documented
        default, it is a value the renderer has to accept. GATEWAY_LOGS_PREFIX was blank here and
        failed the prefix check, and LOGGING_SERVICE_URL was blank and failed the origin check:
        both broke a host run that followed the file exactly, while every test passed, because
        every other test builds its own environment (review).
        """
        example = {}
        for line in (Path(__file__).resolve().parents[1] / ".env.example").read_text(
                encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                name, _, value = line.partition("=")
                example[name.strip()] = value.strip().strip('"').strip("'")
        self.assertIn("LOGGING_SERVICE_URL", example)
        config = self.renderer.configuration(example)
        self.assertTrue(self.routes(config))

    # AI-generated (Claude Code, 2026-11-09; review)
    def test_no_two_routes_render_the_same_matcher_for_one_method(self):
        """Two identical routes are both rendered, and Envoy answers with whichever matched first.

        Filename order decides that, so the earlier file silently wins. The prefix overlap check
        compares prefixes with one another and never looks at the paths another file fixes, so
        GATEWAY_LOCATIONS_PREFIX=/logs was accepted: Supplier rendered `GET /logs`,
        20-supplier.routes.json sorts before 50-logging.routes.json, and an authenticated log query
        reached the Supplier Service, which answers 200 (first review).

        The comparison is of what is rendered, per method - not of whole prefix namespaces. An
        earlier version of this guard rejected a prefix merely nested under a fixed exact path, and
        one that landed on a fixed path under a different method; neither can collide, and these
        prefixes are documented as configurable (second review).
        """
        with self.assertRaises(ValueError) as caught:
            self.renderer.configuration({**self.env, "GATEWAY_LOCATIONS_PREFIX": "/logs"})
        self.assertEqual(str(caught.exception),
                         "Two gateway routes render the same path for GET: /logs")
        # The /gateway copies count too. Every route is rendered twice, and the unprefixed set
        # comes first, so a prefix reaching into /gateway is taken by whichever service got there
        # first. With /gateway/logs the unprefixed definitions were all distinct and startup
        # succeeded, while the internal listener held three routes matching `GET /gateway/logs` -
        # Supplier at index 26 and 27, Logging's copy at 107 (third review).
        with self.assertRaises(ValueError) as caught:
            self.renderer.configuration({**self.env, "GATEWAY_LOCATIONS_PREFIX": "/gateway/logs"})
        self.assertIn("/gateway", str(caught.exception))
        # /gateway itself is worse and invisible to the duplicate check: Supplier's
        # `{locations}/[^/]+` then answered /gateway/logs, /gateway/orders, /gateway/mine and
        # /gateway/health, and a regex matcher never equals an exact path, so nothing collided.
        # Reserved by name.
        with self.assertRaises(ValueError) as caught:
            self.renderer.configuration({**self.env, "GATEWAY_LOCATIONS_PREFIX": "/gateway"})
        self.assertEqual(str(caught.exception),
                         "A gateway route prefix must not start with /gateway")
        # Allowed, and rejected by the first version of this check:
        #   /users/me/auth renders /users/me/auth/login etc., which cannot match the exact
        #     /users/me that 10-user.routes.json fixes;
        #   /location-types collides with Supplier's fixed route only for GET, and Order's root
        #     route there is POST.
        # An overlap across matcher kinds, which equal tuples cannot see: with /admin, Supplier's
        # `{locations}/[^/]+` renders as the regex `GET /admin/[^/]+`, and that matches Order's
        # exact `GET /admin/orders`. Supplier's regex is emitted first, so the request went there -
        # route 28 against Order's route 49 (fourth review).
        with self.assertRaises(ValueError) as caught:
            self.renderer.configuration({**self.env, "GATEWAY_LOCATIONS_PREFIX": "/admin"})
        self.assertRegex(str(caught.exception), r"^A gateway route for supplier matches \w+'s GET ")
        # Checked across services only. Order declares `GET /orders/available` beside
        # `{orders}/[^/]+` on purpose, both reach Order, and the defaults must stay valid - the
        # version of this check that compared whole namespaces rejected them.
        # /gatewayish is not inside /gateway, so the reservation must not catch it either.
        for name, value in (("GATEWAY_AUTH_PREFIX", "/users/me/auth"),
                            ("GATEWAY_ORDERS_PREFIX", "/location-types"),
                            ("GATEWAY_LOCATIONS_PREFIX", "/gatewayish")):
            with self.subTest(**{name: value}):
                self.assertTrue(self.routes(self.renderer.configuration({**self.env, name: value})))

    # AI-generated (Claude Code, 2026-11-09; review)
    def test_two_route_files_cannot_render_the_same_path(self):
        """The same collision from two files rather than from a prefix."""
        self.write_service({"service": "extra", "urlEnv": "EXTRA_SERVICE_URL",
                            "routes": [{"method": "GET", "path": "/logs"}]})
        with self.assertRaises(ValueError) as caught:
            self.renderer.configuration({**self.env, "EXTRA_SERVICE_URL": "http://extra:9000"})
        self.assertIn("same path for GET: /logs", str(caught.exception))

    def test_invalid_definitions_fail_instead_of_disabling_authentication(self):
        valid = {"service": "extra", "urlEnv": "EXTRA_SERVICE_URL",
                 "routes": [{"method": "GET", "path": "/example"}]}
        entries = [
            {"method": "GET", "path": "/example", "public": "false"},
            {"method": "GET", "path": "/example", "publik": True},
            {"method": "GET", "path": "/example", "regex": "/.*"},
            {"method": "GET", "path": "{unknown}/example"},
            {"method": "GET", "path": "/example", "websocket": "true"},
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


class EnvExampleTest(unittest.TestCase):
    # AI-generated (Claude Code, 2026-11-06): AGENTS.md §8 asks for every variable a
    # service reads to be in its .env.example, with a safe placeholder.
    # AI-generated (Claude Code, 2026-11-09; review)
    def test_route_files_urls_are_in_the_deployed_gateway(self):
        """Every route file's urlEnv must be set on api-gateway in the ECS task definition.

        The renderer reads it unconditionally, so a gateway deployed without it exits before Envoy
        starts and takes the whole site with it. The Terraform tests assert this from their side,
        but that workflow runs only when infra/ changes - and adding a route file does not. So the
        check belongs here too, where adding one always runs it (review).
        """
        module = (Path(__file__).resolve().parents[2]
                  / "infra/terraform/modules/services/main.tf").read_text(encoding="utf-8")
        gateway = module[module.index('"api-gateway" = {'):]
        gateway = gateway[:gateway.index(chr(10) + "    }")]
        for file in sorted((Path(__file__).resolve().parents[1] / "envoy/routes").glob("*.routes.json")):
            variable = json.loads(file.read_text(encoding="utf-8"))["urlEnv"]
            with self.subTest(route_file=file.name):
                self.assertRegex(gateway, chr(10) + r"\s*%s\s*=" % re.escape(variable),
                                 f"{variable} is not set on api-gateway in the deployed task "
                                 f"definition; the gateway would exit on startup")

    def test_env_example_lists_every_variable_the_gateway_reads(self):
        gateway = Path(__file__).resolve().parents[1]
        read = set(re.findall(r'env\.get\("([A-Z0-9_]+)"', (gateway / "envoy" / "render.py").read_text()))
        for routes in (gateway / "envoy" / "routes").glob("*.routes.json"):
            read.add(json.loads(routes.read_text())["urlEnv"])
        listed = set(re.findall(r"^([A-Z0-9_]+)=", (gateway / ".env.example").read_text(), re.M))
        self.assertEqual(sorted(read - listed), [])


if __name__ == "__main__":
    unittest.main()
