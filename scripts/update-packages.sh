#!/usr/bin/env bash

# 根据 .gitmodules 拉取或更新 packages 目录下的外部仓库。
# 设计目标：
# - 让协作者只需要执行 npm run update:packages
# - 仓库不存在时自动 clone，已存在时自动更新
# - 更新后把 push URL 设置为无效地址，避免本地误推到外部仓库
set -euo pipefail

# 定位到项目根目录，保证无论从哪里执行脚本，后续路径都一致。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

# .gitmodules 是 packages 仓库清单来源；没有它就无法知道要拉取哪些仓库。
if [ ! -f ".gitmodules" ]; then
  echo "未找到 .gitmodules，无法更新 packages。"
  exit 1
fi

# 确保父目录存在。每个具体仓库路径仍由 .gitmodules 中的 path 决定。
mkdir -p packages

# 获取远端默认分支。
# 优先读取 origin/HEAD；如果本地没有记录，就尝试从远端自动刷新。
# 最后兜底为 main，匹配当前 micro-scaff 仓库的默认分支习惯。
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

# 更新单个 packages 仓库。
# 参数来自 `git config --file .gitmodules --get-regexp`：
# - key 形如 submodule.packages/micro-tools.path
# - path 形如 packages/micro-tools
update_package() {
  local key="$1"
  local path="$2"
  local module_key="${key%.path}"
  local url
  local branch

  # 只允许更新 packages 目录下的仓库，避免误处理其他 submodule。
  if [[ "${path}" != packages/* ]]; then
    echo "跳过 ${path}：不在 packages 目录下。"
    return
  fi

  # 通过 path 对应的 submodule key 反查 url 和可选 branch。
  # 如果 .gitmodules 配了 branch，就优先使用指定分支；否则使用远端默认分支。
  url="$(git config --file .gitmodules --get "${module_key}.url")"
  branch="$(git config --file .gitmodules --get "${module_key}.branch" || true)"

  if [ -z "${url}" ]; then
    echo "跳过 ${path}：未配置 url。"
    return
  fi

  # 仓库已存在就更新 remote 地址并 fetch；不存在就按 .gitmodules 的 url clone。
  # 同时兼容普通 Git 仓库目录和 submodule 目录：
  # - 普通 clone 通常是目录型 .git
  # - submodule 通常是文件型 .git，指向主仓库 .git/modules 下的真实 Git 目录
  if [ -d "${path}/.git" ] || [ -f "${path}/.git" ]; then
    echo "更新 ${path}..."
    git -C "${path}" remote set-url origin "${url}"
    git -C "${path}" fetch --prune origin
  else
    echo "拉取 ${path}..."
    git clone "${url}" "${path}"
  fi

  # 未显式指定 branch 时，自动识别远端默认分支。
  if [ -z "${branch}" ]; then
    branch="$(get_default_branch "${path}")"
  fi

  # 切到目标分支并只允许快进更新，避免脚本自动制造 merge commit。
  git -C "${path}" checkout "${branch}"
  git -C "${path}" pull --ff-only origin "${branch}"

  # 本地禁推：这会写入每个 packages 仓库自己的 Git config。
  # 注意它不是安全边界，真正的禁止推送仍应由 GitHub 权限/分支保护保证。
  git -C "${path}" remote set-url --push origin no_push_allowed

  echo "完成 ${path}：已更新 ${branch}，并禁用 push。"
}

# 从 .gitmodules 动态读取所有 submodule path，不需要在脚本里硬编码仓库列表。
while read -r key path; do
  update_package "${key}" "${path}"
done < <(git config --file .gitmodules --get-regexp '^submodule\..*\.path$')

echo "packages 更新完成。"
