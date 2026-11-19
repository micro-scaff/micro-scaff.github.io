import fs from "node:fs";

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const allowedUsers = JSON.parse(
  fs.readFileSync(new URL("../../.github/document-publishing/allowed-users.json", import.meta.url), "utf8"),
);
const login = event.issue?.user?.login ?? "";
const allowed = allowedUsers.some(user => user.toLowerCase() === login.toLowerCase());

fs.appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${allowed}\n`);
console.log(allowed ? `指定发布人员：${login}` : `外部投稿人员：${login}`);
