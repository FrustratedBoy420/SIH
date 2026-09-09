#!/usr/bin/env bash
#
# Fetch the Sentinel-1 SAR oil-spill corpus the problem statement names.
#
#   Zenodo 8346860   Part I    train/val oil-spill tiles + masks     40.7 GB
#   Zenodo 8253899   Part II   train/val look-alike and oil-free     45.9 GB
#   Zenodo 13761290  Part III  test tiles + ground truth              9.9 GB
#
# CC-BY-4.0. Tiles are 2048x2048x2 sigma-nought in decibels, with 2048x2048
# ground truth, all TIFF.
#
# Part III alone is enough to train against: it carries oil, look-alike and
# oil-free tiles with their masks, and `train_unet` splits it by source tile.
# Start there unless you have 100 GB free.
#
# Zenodo drops long transfers -- reliably, at a few hundred megabytes -- so this
# resumes by byte range and retries until the local size matches. It is safe to
# interrupt and re-run; it picks up where it stopped.
#
# Usage:  tools/fetch_zenodo.sh [part3|part1|part2] [dest-dir]
#
set -uo pipefail

part="${1:-part3}"
dest="${2:-data}"

case "$part" in
  part3) rec=13761290; file="02_Test_images_and_ground_truth.7z";  bytes=9857286144 ;;
  part1) rec=8346860;  file="01_Train_Val_Oil_Spill_images.7z";    bytes=40714567680 ;;
  part2) rec=8253899;  file="01_Train_Val_Lookalike_images.7z";    bytes=22992076800 ;;
  *) echo "usage: $0 [part3|part1|part2] [dest-dir]" >&2; exit 2 ;;
esac

url="https://zenodo.org/api/records/${rec}/files/${file}/content"
mkdir -p "$dest"
# Short local name so an interrupted run is obvious in `ls` and resumes cleanly.
out="${dest}/${part}.7z"

for attempt in $(seq 1 500); do
  have=$(stat -c%s "$out" 2>/dev/null || echo 0)
  if [ "$have" -ge "$bytes" ]; then
    echo "complete: $out ($have bytes)"
    echo "next: 7z x '$out' -o'${dest}/${part}' && python3 -m darktransit.cli train --corpus zenodo --zenodo '${dest}/${part}'"
    exit 0
  fi
  printf 'attempt %d: %.2f of %.2f GB\n' "$attempt" \
    "$(echo "$have" | awk '{print $1/1e9}')" "$(echo "$bytes" | awk '{print $1/1e9}')"
  curl -sS -L --retry 5 --retry-delay 3 --speed-limit 4096 --speed-time 60 \
       -C - -o "$out" "$url" 2>&1 | tail -1
  sleep 3
done

echo "gave up at $(stat -c%s "$out" 2>/dev/null || echo 0) bytes; re-run to continue" >&2
exit 1
