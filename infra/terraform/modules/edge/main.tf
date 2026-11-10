# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 6).
# Author review (Jian Bing, 2026-11-06): Went through it with Claude Code's walkthrough and understood it; ran
#   infra/terraform/check.sh (every stack valid, all tests passed) and checked staging (the locations list and
#   the admin locations page load).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
# Scope: The location photos: a private bucket per environment, uploaded from data/images and read
#   by this distribution at /images/* through Origin Access Control (plan approved by Jian Bing).
# Author review: Pending Jian Bing's review.
# CloudFront ends HTTPS with AWS's own certificate for d….cloudfront.net (no domain, nothing to
# renew) and passes every request to Envoy over HTTP on port 80 (spec §3.3).
# AI-generated (Claude Code).

locals {
  caching_disabled          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  all_viewer_and_cf_headers = "33f36d7e-f396-46d9-90e0-52428a34d9dc" # Managed-AllViewerAndCloudFrontHeaders-2022-06
  caching_optimized         = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  images_dir                = "${path.module}/../../../../data/images"
}

data "aws_caller_identity" "current" {}

# --- Location photos ---------------------------------------------------------------------------
# AI-generated (Claude Code, 2026-11-10). The seed photos in data/images, served from this site's
# /images/* so they load from CloudFront's cache instead of the course template's GitHub. The bucket
# is private: only this distribution reads it, through Origin Access Control.

resource "aws_s3_bucket" "images" {
  bucket        = "foc-${var.env}-images-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # every object comes from data/images, so nothing is lost
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "image" {
  for_each     = fileset(local.images_dir, "*.jpeg")
  bucket       = aws_s3_bucket.images.id
  key          = "images/${each.value}" # CloudFront passes the whole path, /images/<file>
  source       = "${local.images_dir}/${each.value}"
  etag         = filemd5("${local.images_dir}/${each.value}") # re-uploads a changed photo
  content_type = "image/jpeg"
}

resource "aws_cloudfront_origin_access_control" "images" {
  name                              = "foc-${var.env}-images"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.images.arn}/images/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.images]
}

resource "aws_cloudfront_distribution" "this" {
  enabled     = true
  comment     = "foc-${var.env}"
  price_class = "PriceClass_200" # includes the Singapore edge locations

  origin {
    origin_id   = "envoy"
    domain_name = var.origin_domain
    custom_header {
      name  = "X-Origin-Key" # checked by Envoy (deploy part 1), like X-Service-Key between services
      value = var.origin_key
    }
    custom_origin_config {
      origin_protocol_policy = "http-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # AI-generated (Claude Code, 2026-11-10): the location photos.
  origin {
    origin_id                = "images"
    domain_name              = aws_s3_bucket.images.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.images.id
  }

  ordered_cache_behavior {
    path_pattern           = "/images/*"
    target_origin_id       = "images"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.caching_optimized # the same photo for everyone
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
