# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 6). Runs with a mocked AWS provider.
# Author review (Jian Bing, 2026-11-06): Not read line by line; ran infra/terraform/check.sh, which runs these
#   tests (all passed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
# Scope: The location photos' private bucket behind CloudFront at /images/* (approved by Jian Bing); the
#   Envoy checks now pick their origin by name.
# Author review: Pending Jian Bing's review.
# AI-generated (Claude Code).

mock_provider "aws" {
  mock_resource "aws_cloudfront_distribution" {
    defaults = { domain_name = "d1abcdef.cloudfront.net", arn = "arn:aws:cloudfront::111122223333:distribution/E1ABCDEF" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::foc-staging-images-111122223333", bucket_regional_domain_name = "foc-staging-images-111122223333.s3.ap-southeast-1.amazonaws.com" }
  }
  mock_resource "aws_cloudfront_origin_access_control" {
    defaults = { id = "E2OACTEST" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
}

variables {
  env           = "staging"
  origin_domain = "ec2-1-2-3-4.ap-southeast-1.compute.amazonaws.com"
  origin_key    = "test-origin-key"
}

run "edge" {
  command = apply

  assert {
    condition = (
      [for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "envoy"][0].domain_name == "ec2-1-2-3-4.ap-southeast-1.compute.amazonaws.com" &&
      one([for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "envoy"][0].custom_origin_config).origin_protocol_policy == "http-only" &&
      one([for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "envoy"][0].custom_origin_config).http_port == 80
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

  # Jian Bing, 2026-10-25: like X-Service-Key, CloudFront proves the request came through OUR
  # distribution; Envoy checks it (deploy part 1).
  assert {
    condition = [
      for h in [for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "envoy"][0].custom_header : h.value if h.name == "X-Origin-Key"
    ] == ["test-origin-key"]
    error_message = "CloudFront must send X-Origin-Key with the environment's key."
  }

  # AI-generated (Claude Code, 2026-11-10): the location photos come from a private bucket per
  # environment, read only by this distribution through Origin Access Control (Jian Bing's choice).
  assert {
    condition = (
      aws_s3_bucket.images.bucket == "foc-staging-images-111122223333" &&
      aws_s3_bucket_public_access_block.images.block_public_acls &&
      aws_s3_bucket_public_access_block.images.block_public_policy &&
      aws_s3_bucket_public_access_block.images.ignore_public_acls &&
      aws_s3_bucket_public_access_block.images.restrict_public_buckets
    )
    error_message = "The images bucket is per environment and blocks every kind of public access."
  }
  assert {
    condition = (
      [for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "images"][0].domain_name == "foc-staging-images-111122223333.s3.ap-southeast-1.amazonaws.com" &&
      [for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "images"][0].origin_access_control_id == "E2OACTEST" &&
      aws_cloudfront_origin_access_control.images.origin_access_control_origin_type == "s3" &&
      aws_cloudfront_origin_access_control.images.signing_behavior == "always"
    )
    error_message = "CloudFront reads the bucket through Origin Access Control, signing every request."
  }
  assert {
    condition = (
      one(aws_cloudfront_distribution.this.ordered_cache_behavior).path_pattern == "/images/*" &&
      one(aws_cloudfront_distribution.this.ordered_cache_behavior).target_origin_id == "images" &&
      one(aws_cloudfront_distribution.this.ordered_cache_behavior).viewer_protocol_policy == "redirect-to-https" &&
      toset(one(aws_cloudfront_distribution.this.ordered_cache_behavior).allowed_methods) == toset(["GET", "HEAD"]) &&
      one(aws_cloudfront_distribution.this.ordered_cache_behavior).cache_policy_id == "658327ea-f89d-4fab-a63d-7e88639e58f6"
    )
    error_message = "/images/* goes to the bucket, read-only, over HTTPS, cached (Managed-CachingOptimized)."
  }
  assert {
    condition = (
      jsondecode(aws_s3_bucket_policy.images.policy).Statement[0].Principal.Service == "cloudfront.amazonaws.com" &&
      jsondecode(aws_s3_bucket_policy.images.policy).Statement[0].Action == "s3:GetObject" &&
      jsondecode(aws_s3_bucket_policy.images.policy).Statement[0].Resource == "arn:aws:s3:::foc-staging-images-111122223333/images/*" &&
      jsondecode(aws_s3_bucket_policy.images.policy).Statement[0].Condition.StringEquals["AWS:SourceArn"] == "arn:aws:cloudfront::111122223333:distribution/E1ABCDEF" &&
      length(jsondecode(aws_s3_bucket_policy.images.policy).Statement) == 1
    )
    error_message = "Only this distribution may read the photos, and nothing else is allowed."
  }
  assert {
    condition = (
      toset(keys(aws_s3_object.image)) == toset(["ANNA.jpeg", "COOL_SPOT.jpeg", "INSTACHEF.jpeg", "NUS_COOP.jpeg", "PRINTER_COM2.jpeg", "ROBOT_CAFE.jpeg"]) &&
      alltrue([for k, o in aws_s3_object.image : o.key == "images/${k}" && o.content_type == "image/jpeg"])
    )
    error_message = "Every photo in data/images is uploaded under images/ as image/jpeg."
  }
  assert {
    condition     = output.images_url == "https://d1abcdef.cloudfront.net/images"
    error_message = "The photos' public base URL is the site's /images."
  }
}
