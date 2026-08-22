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

