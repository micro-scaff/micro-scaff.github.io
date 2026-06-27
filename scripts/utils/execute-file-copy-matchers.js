/**
 * 判断某个文件名或目录名是否命中匹配规则。
 *
 * @param {string} name 当前要判断的目录名或文件名
 * @param {string | RegExp | Array<string | RegExp> | undefined} matcher 匹配规则
 * @returns {boolean} 是否命中规则
 */
export function matchName(name, matcher) {
  if (!matcher) {
    return true;
  }

  if (Array.isArray(matcher)) {
    return matcher.some(item => matchName(name, item));
  }

  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;

    return matcher.test(name);
  }

  return name === matcher;
}

/**
 * 判断某个文件名、目录名或相对路径是否应该被忽略。
 *
 * @param {string} name 当前要判断的目录名、文件名或相对路径
 * @param {Array<string | RegExp>} ignore 忽略规则列表
 * @returns {boolean} 是否应该跳过
 */
export function shouldIgnore(name, ignore = []) {
  return ignore.some(item => matchName(name, item));
}

/**
 * 判断文件名或相对路径是否命中匹配规则。
 *
 * @param {string} fileName 文件名
 * @param {string} relativePath 相对 entry 的路径
 * @param {string | RegExp | Array<string | RegExp> | undefined} matcher 匹配规则
 * @returns {boolean} 是否命中
 */
export function matchFile(fileName, relativePath, matcher) {
  return matchName(fileName, matcher) || matchName(relativePath, matcher);
}

/**
 * 判断相对路径的任意一段是否命中规则。
 *
 * @param {string[]} relativeSegments 包目录相对 entry 的路径片段
 * @param {string | RegExp | Array<string | RegExp> | undefined} matcher 匹配规则
 * @returns {boolean} 是否命中
 */
export function matchPathSegments(relativeSegments, matcher) {
  return relativeSegments.some(segment => matchName(segment, matcher));
}

