#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
configured=$(git -C "$root" config --file .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')

[ -n "$configured" ] || {
  echo "No direct submodules are configured." >&2
  exit 1
}

status=$(git -C "$root" submodule status)
if printf '%s\n' "$status" | grep -Eq '^[-U]'; then
  echo "One or more direct submodules are not initialized. Run bun run vendor:setup." >&2
  printf '%s\n' "$status" >&2
  exit 1
fi

for path in $configured; do
  test -d "$root/$path" || {
    echo "Submodule directory is missing: $path" >&2
    exit 1
  }
done
