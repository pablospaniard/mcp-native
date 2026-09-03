#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [, , command = "doctor", ...arguments_] = process.argv;

try {
  if (command === "doctor") {
    runDoctor(arguments_);
  } else if (command === "scaffold-catalog") {
    scaffoldCatalog(arguments_);
  } else if (command === "scaffold-extension") {
    scaffoldExtension(arguments_);
  } else if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else {
    fail(`Unknown command ${JSON.stringify(command)}. Run mcp-native help.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "MCP Native CLI failed.");
}

function runDoctor(commandArguments) {
  const json = commandArguments.includes("--json");
  const directoryArgument = commandArguments.find((value) => value !== "--json") ?? ".";
  const directory = resolve(directoryArgument);
  const manifestPath = join(directory, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No package.json found in ${directory}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const dependencyMaps = [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.peerDependencies ?? {},
  ];
  const dependencies = Object.assign({}, ...dependencyMaps);
  const hasWorkspaces = manifest.workspaces !== undefined;
  const mcpNativeEntries = Object.entries(dependencies).filter(
    ([name]) => name === "mcp-native" || name.startsWith("@mcp-native/"),
  );
  const findings = [];
  if (mcpNativeEntries.length === 0) {
    findings.push(
      finding(
        hasWorkspaces ? "warning" : "error",
        hasWorkspaces ? "packages-not-at-workspace-root" : "packages-missing",
        hasWorkspaces
          ? "No MCP Native package is declared at the workspace root; run doctor in the consuming workspace too."
          : "No MCP Native package is declared.",
      ),
    );
  }
  const ranges = new Set(mcpNativeEntries.map(([, range]) => String(range)));
  if (ranges.size > 1) {
    findings.push(
      finding(
        "error",
        "version-ranges-mixed",
        "MCP Native packages use different version ranges; align them before installation.",
      ),
    );
  }
  const usesNative = mcpNativeEntries.some(
    ([name]) =>
      name === "mcp-native" || name === "@mcp-native/react-native" || name === "@mcp-native/host",
  );
  if (usesNative && dependencies.react === undefined) {
    findings.push(
      finding("error", "react-missing", "A React dependency is required by the native renderer."),
    );
  }
  if (usesNative && dependencies["react-native"] === undefined) {
    findings.push(
      finding(
        "warning",
        "react-native-not-declared",
        "No React Native dependency is declared; ignore this only when the package is supplied by the application platform.",
      ),
    );
  }
  const metroPaths = ["metro.config.js", "metro.config.cjs", "metro.config.mjs"].map((name) =>
    join(directory, name),
  );
  if (usesNative && hasWorkspaces && !metroPaths.some(existsSync)) {
    findings.push(
      finding(
        "warning",
        "metro-workspace-config-missing",
        "This workspace has no Metro configuration; verify watchFolders, resolver paths, and duplicate React exclusion.",
      ),
    );
  }
  if (usesNative && !existsSync(join(directory, "tsconfig.json"))) {
    findings.push(
      finding(
        "warning",
        "typescript-config-missing",
        "No tsconfig.json was found, so typed catalog adapters cannot be checked here.",
      ),
    );
  }
  if (findings.length === 0) {
    findings.push(
      finding("ok", "configuration-ready", "No common package or workspace issue found."),
    );
  }
  const report = { directory, packageName: manifest.name ?? basename(directory), findings };
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`MCP Native doctor: ${report.packageName}\n`);
    for (const item of findings) {
      process.stdout.write(`${item.level.toUpperCase()} ${item.code}: ${item.message}\n`);
    }
  }
  if (findings.some((item) => item.level === "error")) process.exitCode = 1;
}

function scaffoldCatalog(commandArguments) {
  const outputDirectory = resolve(commandArguments[0] ?? ".");
  const outputPath = join(outputDirectory, "mcpNativeCatalog.tsx");
  writeNewFile(outputPath, catalogTemplate());
  process.stdout.write(`Created ${outputPath}\n`);
}

function scaffoldExtension(commandArguments) {
  const [extensionId, componentName, directoryArgument = "."] = commandArguments;
  if (
    extensionId === undefined ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)+(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/u.test(extensionId)
  ) {
    throw new Error("scaffold-extension requires a namespaced extension ID");
  }
  if (componentName === undefined || !/^[A-Z][A-Za-z0-9]*$/u.test(componentName)) {
    throw new Error("scaffold-extension requires a PascalCase component name");
  }
  const outputDirectory = resolve(directoryArgument);
  const manifestPath = join(outputDirectory, `${componentName}.manifest.json`);
  const componentPath = join(outputDirectory, `${componentName}.tsx`);
  assertNewFiles([manifestPath, componentPath]);
  writeNewFile(
    manifestPath,
    `${JSON.stringify(extensionManifest(extensionId, componentName), null, 2)}\n`,
  );
  writeNewFile(componentPath, extensionComponentTemplate(componentName));
  process.stdout.write(`Created ${manifestPath}\nCreated ${componentPath}\n`);
}

function assertNewFiles(paths) {
  const existingPath = paths.find(existsSync);
  if (existingPath !== undefined) {
    throw new Error(`Refusing to overwrite existing file ${existingPath}`);
  }
}

function writeNewFile(path, content) {
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing file ${path}`);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
}

function extensionManifest(extensionId, componentName) {
  return {
    profileVersion: "1",
    extensionId,
    catalogId: `${extensionId}@1`,
    catalogVersion: "1",
    schemaVersion: "1.0.0",
    componentName: `${extensionId}:${componentName}`,
    propsSchema: {
      type: "object",
      properties: { label: { type: "string", minLength: 1, maxLength: 128 } },
      required: ["label"],
      additionalProperties: false,
    },
    events: [],
    platforms: ["android", "ios"],
    accessibility: {
      ownership: "host",
      requiresLabel: true,
      behavior: "Expose one host-rendered labeled value.",
    },
    resourceNeeds: [],
    permissionNeeds: [],
    limits: {
      maximumInstances: 16,
      maximumEventPayloadValues: 8,
      maximumEventPayloadStringCodeUnits: 512,
      maximumPropsValues: 16,
      maximumPropsStringCodeUnits: 2048,
      maximumUpdatesPerSurface: 32,
    },
    fallback: { kind: "reject" },
    compatibility: { owner: "Replace with the responsible application team" },
  };
}

function catalogTemplate() {
  return `import { createA2uiV1NativeHost } from "@mcp-native/react-native";
import { Button, Text, TextInput, View } from "react-native";

// Keep this registration at module scope so component identity and local state remain stable.
export const mcpNativeHost = createA2uiV1NativeHost({
  components: { Button, Text, TextInput, View },
  allowedEventNames: [],
  allowedFunctionNames: [],
  layoutContracts: {
    View: {
      allowedParents: ["bounded", "scroll", "unbounded"],
      sizing: "intrinsic",
    },
  },
});
`;
}

function extensionComponentTemplate(componentName) {
  return `import manifestJson from "./${componentName}.manifest.json";
import { createNativeHostExtensionRegistration } from "@mcp-native/react-native";
import { Text } from "react-native";

function ${componentName}({ label, accessibilityLabel }: { label: string; accessibilityLabel?: string }) {
  return <Text accessibilityLabel={accessibilityLabel}>{label}</Text>;
}

export const ${componentName[0].toLowerCase()}${componentName.slice(1)}Registration =
  createNativeHostExtensionRegistration(
    manifestJson,
    ${componentName},
    ({ accessibilityLabel, semanticProps }) => {
      if (typeof semanticProps.label !== "string") {
        throw new Error("Validated extension props do not match the local component");
      }
      return {
        label: semanticProps.label,
        ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
      };
    },
  );
`;
}

function finding(level, code, message) {
  return { level, code, message };
}

function printHelp() {
  process.stdout.write(`Usage:
  mcp-native doctor [directory] [--json]
  mcp-native scaffold-catalog [output-directory]
  mcp-native scaffold-extension <extension-id> <PascalCaseName> [output-directory]
`);
}

function fail(message) {
  process.stderr.write(`mcp-native: ${message}\n`);
  process.exitCode = 1;
}
