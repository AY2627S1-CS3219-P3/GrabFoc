# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 6).
# Author review: Pending Jian Bing's review.
# CloudFront ends HTTPS with AWS's own certificate for d….cloudfront.net (no domain, nothing to
# renew) and passes every request to Envoy over HTTP on port 80 (spec §3.3).

locals {
  caching_disabled          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  all_viewer_and_cf_headers = "33f36d7e-f396-46d9-90e0-52428a34d9dc" # Managed-AllViewerAndCloudFrontHeaders-2022-06
}

resource "aws_cloudfront_distribution" "this" {
  enabled     = true
  comment     = "foc-${var.env}"
  price_class = "PriceClass_200" # includes the Singapore edge locations

  origin {
    origin_id   = "envoy"
    domain_name = var.origin_domain
    custom_origin_config {
      origin_protocol_policy = "http-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "envoy"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    # Nothing is cached (pages and API answers are per user), and every header, cookie and query
    # string reaches Envoy, including CloudFront-Forwarded-Proto for the frontend's HTTPS check.
    cache_policy_id          = local.caching_disabled
    origin_request_policy_id = local.all_viewer_and_cf_headers
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
