import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

/**
 * The Linux deploy path is shell and YAML, which CI lints (shellcheck, docker
 * compose config) and which the owner exercises on pc2. These pin down the
 * properties that fail silently or only on the server when they drift.
 */
const read = (file: string) => fs.readFileSync(file, "utf8");

test("the shell scripts are committed executable and with LF endings", () => {
  const modes = execFileSync("git", ["ls-files", "-s", "update.sh", "backup.sh"], { encoding: "utf8" });
  // Only meaningful once they are committed; before that the check below still runs.
  for (const line of modes.trim().split("\n").filter(Boolean)) assert.match(line, /^100755 /, line);
  for (const file of ["update.sh", "backup.sh"]) {
    assert.equal(read(file).includes("\r"), false, `${file} has CRLF line endings`);
    assert.ok((fs.statSync(file).mode & 0o111) !== 0, `${file} is not executable`);
  }
  // A Windows checkout must not convert them either: the owner edits from Windows.
  assert.match(read(".gitattributes"), /^\*\.sh\s+text\s+eol=lf$/m);
});

test("pc2's override bind-mounts the data, publishes no port, and joins the proxy network", () => {
  const override = read("docker-compose.pc2.yml");
  assert.match(override, /ports: !reset \[\]/);
  assert.match(override, /source: \$\{HALLS_DATA_DIR:-\/srv\/data\/halls\}/);
  assert.match(override, /target: \/data\b/);
  // A directory Docker created for a missing path would be root's, and uid 1000 could not write it.
  assert.match(override, /create_host_path: false/);
  assert.match(override, /networks:\s*\n\s*proxy:\s*\n\s*external: true/);
  // The healthcheck comes from the base file; the override must not replace or drop it.
  assert.equal(/healthcheck/.test(override.replace(/^#.*$/gm, "")), false);
  assert.match(read("docker-compose.yml"), /healthcheck:/);
});

test("update.sh and backup.sh agree with the compose file and with each other", () => {
  const update = read("update.sh");
  const backup = read("backup.sh");
  const compose = read("docker-compose.yml");
  const image = /^\s*image:\s*(\S+)/m.exec(compose)?.[1];
  assert.equal(image, "halls-of-exile");
  assert.match(update, new RegExp(`^IMAGE=${image}$`, "m"));
  for (const script of [update, backup]) {
    assert.match(script, /^SERVICE=halls$/m);
    assert.match(compose, /^\s{2}halls:$/m);
    // One lock file, so a nightly backup waits for a deploy instead of racing it.
    assert.match(script, /^LOCK=\.update\.lock$/m);
    assert.match(script, /flock /);
  }
  assert.match(read(".gitignore"), /^\.update\.lock$/m);
  // The backup script both of them call has to be in the image.
  assert.match(read("Dockerfile"), /scripts\/backup\.mjs/);
});
