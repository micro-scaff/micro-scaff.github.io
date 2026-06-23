#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

if [ ! -f ".gitmodules" ]; then
  echo "未找到 .gitmodules，无法更新 packages。"
  exit 1
fi

mkdir -p packages

get_default_branch() {
  local path="$1"
  local branch

  branch="$(git -C "${path}" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"

  if [ -z "${branch}" ]; then
    git -C "${path}" remote set-head origin --auto >/dev/null 2>&1 || true
    branch="$(git -C "${path}" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  fi

  if [ -z "${branch}" ]; then
    branch="main"
  fi

  echo "${branch}"
}

update_package() {
  local key="$1"
  local path="$2"
  local module_key="${key%.path}"
  local url
  local branch

  if [[ "${path}" != packages/* ]]; then
    echo "跳过 ${path}：不在 packages 目录下。"
    return
  fi

  url="$(git config --file .gitmodules --get "${module_key}.url")"
  branch="$(git config --file .gitmodules --get "${module_key}.branch" || true)"

  if [ -z "${url}" ]; then
    echo "跳过 ${path}：未配置 url。"
    return
  fi

  if [ -d "${path}/.git" ] || [ -f "${path}/.git" ]; then
    echo "更新 ${path}..."
    git -C "${path}" remote set-url origin "${url}"
    git -C "${path}" fetch --prune origin
  else
    echo "拉取 ${path}..."
    git clone "${url}" "${path}"
  fi

  if [ -z "${branch}" ]; then
    branch="$(get_default_branch "${path}")"
  fi

  git -C "${path}" checkout "${branch}"
  git -C "${path}" pull --ff-only origin "${branch}"
  git -C "${path}" remote set-url --push origin no_push_allowed

  echo "完成 ${path}：已更新 ${branch}，并禁用 push。"
}

while read -r key path; do
  update_package "${key}" "${path}"
done < <(git config --file .gitmodules --get-regexp '^submodule\..*\.path$')

echo "packages 更新完成。"
