# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 6). Runs with a mocked AWS provider.
# Author review: Pending Jian Bing's review.

mock_provider "aws" {
  mock_resource "aws_cloudfront_distribution" {
    defaults = { domain_name = "d1abcdef.cloudfront.net" }
  }
}

variables {
  env           = "staging"
  origin_domain = "ec2-1-2-3-4.ap-southeast-1.compute.amazonaws.com"
}

run "edge" {
  command = apply

  assert {
    condition = (
      one(aws_cloudfront_distribution.this.origin).domain_name == "ec2-1-2-3-4.ap-southeast-1.compute.amazonaws.com" &&
      one(one(aws_cloudfront_distribution.this.origin).custom_origin_config).origin_protocol_policy == "http-only" &&
      one(one(aws_cloudfront_distribution.this.origin).custom_origin_config).http_port == 80
    )
    error_message = "CloudFront talks plain HTTP to Envoy on port 80 of the server."
  }
  assert {
    condition = (
      one(aws_cloudfront_distribution.this.default_cache_behavior).viewer_protocol_policy == "redirect-to-https" &&
      length(one(aws_cloudfront_distribution.this.default_cache_behavior).allowed_methods) == 7
    )
    error_message = "Browsers get HTTPS; every HTTP method reaches the API."
  }
  assert {
    condition = (
      one(aws_cloudfront_distribution.this.default_cache_behavior).cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" &&
      one(aws_cloudfront_distribution.this.default_cache_behavior).origin_request_policy_id == "33f36d7e-f396-46d9-90e0-52428a34d9dc"
    )
    error_message = "No caching (Managed-CachingDisabled); forward everything incl. CloudFront-Forwarded-Proto (Managed-AllViewerAndCloudFrontHeaders-2022-06)."
  }
  assert {
    condition = (
      one(aws_cloudfront_distribution.this.viewer_certificate).cloudfront_default_certificate &&
      aws_cloudfront_distribution.this.price_class == "PriceClass_200" &&
      length(coalesce(aws_cloudfront_distribution.this.aliases, toset([]))) == 0
    )
    error_message = "Default *.cloudfront.net certificate, no domain, edge locations that include Singapore."
  }
  assert {
    condition     = output.url == "https://d1abcdef.cloudfront.net"
    error_message = "The environment's URL is its CloudFront domain over HTTPS."
  }
}
