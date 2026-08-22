#!/usr/bin/env bash

set -euo pipefail

legistar_origin="https://sfgov.legistar.com"
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_root="${project_root}/data/full-board-meetings"
working_dir="$(mktemp -d)"
download_config="${working_dir}/curl.conf"

cleanup() {
  rm -rf "${working_dir}"
}
trap cleanup EXIT

# These official Legistar calendar feeds are filtered to full Board of
# Supervisors meetings for each year. Each feed supplies the canonical event
# ID and GUID used by the published agenda and minutes endpoints.
while IFS='|' read -r year feed_id feed_guid; do
  feed_file="${working_dir}/${year}.xml"

  curl \
    --location \
    --fail \
    --silent \
    --show-error \
    --retry 3 \
    "${legistar_origin}/Feed.ashx?M=Calendar&ID=${feed_id}&GUID=${feed_guid}&Mode=${year}" \
    --output "${feed_file}"

  perl -0777 -ne '
    while (
      m{<item>.*?<title>Board of Supervisors - (\d{1,2})/(\d{1,2})/(\d{4}) - .*?</title>.*?<link>[^<]*?(?:[?&]|&amp;)ID=(\d+)&amp;GUID=([^&<]+).*?</item>}sg
    ) {
      printf "%04d-%02d-%02d\t%s\t%s\n", $3, $1, $2, $4, $5;
    }
  ' "${feed_file}" |
    while IFS=$'\t' read -r meeting_date event_id event_guid; do
      for document_type in agendas minutes; do
        case "${document_type}" in
          agendas) endpoint_type="A"; filename_suffix="agenda" ;;
          minutes) endpoint_type="M"; filename_suffix="minutes" ;;
        esac

        destination_dir="${output_root}/${document_type}/${year}"
        destination="${destination_dir}/${meeting_date}_${event_id}_${filename_suffix}.pdf"

        mkdir -p "${destination_dir}"
        {
          printf 'url = "%s/View.ashx?M=%s&ID=%s&GUID=%s"\n' \
            "${legistar_origin}" "${endpoint_type}" "${event_id}" "${event_guid}"
          printf 'output = "%s"\n' "${destination}"
        } >> "${download_config}"
      done
    done
done <<'FEEDS'
2012|43067606|67ef31e5-ed46-4e48-8fbe-6587a4dc6af2
2013|43067628|bf15dc11-2bea-4d7d-85c5-3fb7c582108f
2014|43067643|bec6103a-8d35-4ae6-9204-061abff45455
2015|43067660|2711a9f8-c35c-4d88-ab17-507bd82dc9c6
2016|43067692|40eeb97f-f213-462f-8376-caf3dd4502da
2017|43067712|6414f8fd-2eaa-484e-807f-39880b6fba05
2018|43067731|d92eb129-1f04-49b8-92de-13b6141f86c7
2019|43067743|a621c99b-4de0-43dc-8734-57f4284a0bf1
2020|43067767|172aa752-68c4-4d99-8ef3-cc0302d86321
2021|43067801|62a8624a-e05e-4d27-8701-b2cfce16cc23
2022|43067831|12caf9d0-228b-4883-98ec-ca93d2d9ed8a
2023|43067850|d0019ced-be23-40bc-ac18-9229370c5efe
2024|43067870|89d2024e-c297-4d36-b1b0-ad958d220a63
2025|43067890|13a9cb1f-8bab-4352-acbf-e4d936f3fc0a
FEEDS

curl \
  --parallel \
  --parallel-max 6 \
  --location \
  --fail \
  --silent \
  --show-error \
  --retry 3 \
  --remote-time \
  --config "${download_config}" || true

# Some calendar records do not have a published agenda or minutes. Legistar
# returns an HTML status page for those endpoints, so keep only genuine PDFs.
while IFS= read -r downloaded_file; do
  if [[ "$(head -c 5 "${downloaded_file}")" != "%PDF-" ]]; then
    rm -f "${downloaded_file}"
  fi
done < <(find "${output_root}" -type f -name '*.pdf' -print)
