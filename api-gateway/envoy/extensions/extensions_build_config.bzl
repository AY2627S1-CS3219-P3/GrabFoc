# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-12
# Scope: Limit compiled extensions to gateway requirements.
# Author review: Pending human review.
# AI-generated; review pending.
EXTENSIONS = {
    "envoy.access_loggers.stdout": "//source/extensions/access_loggers/stream:config",
    "envoy.access_loggers.file": "//source/extensions/access_loggers/file:config",
    "envoy.clusters.strict_dns": "//source/extensions/clusters/strict_dns:strict_dns_cluster_lib",
    "envoy.clusters.logical_dns": "//source/extensions/clusters/logical_dns:logical_dns_cluster_lib",
    "envoy.clusters.static": "//source/extensions/clusters/static:static_cluster_lib",
    "envoy.clusters.dns": "//source/extensions/clusters/dns:dns_cluster_lib",
    "envoy.filters.http.jwt_authn": "//source/extensions/filters/http/jwt_authn:config",
    "envoy.filters.http.lua": "//source/extensions/filters/http/lua:config",
    "envoy.filters.http.router": "//source/extensions/filters/http/router:config",
    "envoy.filters.network.http_connection_manager": "//source/extensions/filters/network/http_connection_manager:config",
    "envoy.transport_sockets.raw_buffer": "//source/extensions/transport_sockets/raw_buffer:config",
    "envoy.transport_sockets.tls": "//source/extensions/transport_sockets/tls:config",
    "envoy.upstreams.http.http": "//source/extensions/upstreams/http/http:config",
    "envoy.network.dns_resolver.cares": "//source/extensions/network/dns_resolver/cares:config",
    "envoy.http.header_validators.envoy_default": "//source/extensions/http/header_validators/envoy_default:config",
    "envoy.load_balancing_policies.round_robin": "//source/extensions/load_balancing_policies/round_robin:config",
}
EXTENSION_CONFIG_VISIBILITY = ["//:extension_config", "//:contrib_library", "//:mobile_library"]
EXTENSION_PACKAGE_VISIBILITY = ["//:extension_library", "//:contrib_library", "//:mobile_library"]
CONTRIB_EXTENSION_PACKAGE_VISIBILITY = ["//:contrib_library"]
MOBILE_PACKAGE_VISIBILITY = ["//:mobile_library"]

# Set this variable to true to disable alwayslink for envoy_cc_library.
# TODO(alyssawilk) audit uses of this in source/ and migrate all libraries to extensions.
LEGACY_ALWAYSLINK = 1
