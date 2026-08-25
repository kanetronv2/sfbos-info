#!/usr/bin/env bash

set -euo pipefail

source_page="https://sfbos.archive.sf.gov/meetings/full-board-meetings"
source_origin="https://sfbos.archive.sf.gov"
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_root="${project_root}/data/full-board-meetings"
page_file="$(mktemp)"

cleanup() {
  rm -f "${page_file}"
}
trap cleanup EXIT

curl --location --fail --silent --show-error "${source_page}" --output "${page_file}"

for document_type in agendas minutes; do
  case "${document_type}" in
    agendas) source_suffix="agenda" ;;
    minutes) source_suffix="minutes" ;;
  esac

  while IFS= read -r source_path; do
    filename="${source_path##*/}"
    compact_date="${filename#bag}"
    compact_date="${compact_date%%_*}"
    year="20${compact_date:4:2}"
    destination_dir="${output_root}/${document_type}/${year}"

    mkdir -p "${destination_dir}"
    curl \
      --location \
      --fail \
      --silent \
      --show-error \
      --retry 3 \
      --remote-time \
      "${source_origin}${source_path}" \
      --output "${destination_dir}/${filename}"
  done < <(
    sed -nE "s#.*href=\"([^\"]*/bag[0-9]+_${source_suffix}\\.pdf)\".*#\\1#p" "${page_file}" |
      sort -u
  )
done

# Some finalized Legistar records appear before, or without, a matching file on
# the Board's archive page. Keep these official sources reproducible here.
supplemental_documents=(
  "minutes|2026|2026-04-21_1407453_52DE698B-9DC0-4B46-875E-EF1C6F7B01AD_minutes.pdf|https://sfgov.legistar.com/View.ashx?M=M&ID=1407453&GUID=52DE698B-9DC0-4B46-875E-EF1C6F7B01AD"
)

for record in "${supplemental_documents[@]}"; do
  IFS="|" read -r document_type year filename source_url <<< "${record}"
  destination_dir="${output_root}/${document_type}/${year}"
  mkdir -p "${destination_dir}"
  curl \
    --location \
    --fail \
    --silent \
    --show-error \
    --retry 3 \
    --remote-time \
    "${source_url}" \
    --output "${destination_dir}/${filename}"
done
