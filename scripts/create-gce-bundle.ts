#!/usr/bin/env bun

import { createGceBundle } from "../apps/clog/src/deploy/gce-bundle";

const outputArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--output="));

const outputPath = outputArgument?.slice("--output=".length);
const bundle = createGceBundle({
  outputPath,
});

process.stdout.write(
  [
    `[bundle:gce] created ${bundle.outputPath}`,
    `[bundle:gce] manifest ${bundle.manifestPath}`,
    `[bundle:gce] files ${bundle.fileCount}`,
  ].join("\n") + "\n",
);
