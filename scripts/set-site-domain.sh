#!/bin/sh
# Stamp the live domain into the static site's absolute-URL placeholders.
# OG images and sitemaps require absolute URLs, so the package ships with a
# __SITE_URL__ token that this script replaces after the domain is known.
#
#   ./scripts/set-site-domain.sh https://windtunnel.observer
#
# Idempotent: re-running with a new domain replaces the previous one.
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 https://your-domain" >&2
  exit 1
fi

URL=$(printf '%s' "$1" | sed 's:/*$::')   # strip trailing slash
DIR="$(cd "$(dirname "$0")/../site" && pwd)"

for f in "$DIR"/*.html "$DIR"/studies/*.html "$DIR"/method/*.html "$DIR"/robots.txt "$DIR"/sitemap.xml "$DIR"/llms.txt; do
  [ -f "$f" ] || continue
  # replace the token, or re-stamp a previously written absolute URL
  sed -i '' \
    -e "s|__SITE_URL__|$URL|g" \
    -e "s|https://[a-z0-9.-]*\(/og\.jpg\)|$URL\1|g" \
    -e "s|<loc>https://[a-z0-9.-]*|<loc>$URL|g" \
    -e "s|Sitemap: https://[a-z0-9.-]*|Sitemap: $URL|g" \
    -e "s|rel=\"canonical\" href=\"https://[a-z0-9.-]*|rel=\"canonical\" href=\"$URL|g" \
    -e "s|\"url\": \"https://[a-z0-9.-]*|\"url\": \"$URL|g" \
    -e "s|\"@id\": \"https://[a-z0-9.-]*|\"@id\": \"$URL|g" \
    -e "s|\"mainEntityOfPage\": \"https://[a-z0-9.-]*|\"mainEntityOfPage\": \"$URL|g" \
    -e "s|\"logo\": \"https://[a-z0-9.-]*|\"logo\": \"$URL|g" \
    -e "s|](https://[a-z0-9.-]*/|]($URL/|g" \
    "$f"
done

echo "stamped $URL into site/"
grep -h "og:image\|<loc>\|Sitemap:" "$DIR"/index.html "$DIR"/robots.txt "$DIR"/sitemap.xml | sed 's/^[[:space:]]*/  /'
