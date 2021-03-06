// Node.js built-in:

const path = require('path');

// External imports:

const { log, info, warn, error } = require('console');

// default execa object
const execaDefault = require('execa');

// default fs object
const fsExtra = require('fs-extra');

const jsonfile = require('jsonfile');

// Internal imports:

const normalizedOptions = require('./normalized-options');

// Imports from templates

const templates = require('../templates');
const exampleTemplates = require('../templates/example');

const {
  DEFAULT_PACKAGE_IDENTIFIER,
  DEFAULT_PLATFORMS,
  DEFAULT_GITHUB_ACCOUNT,
  DEFAULT_AUTHOR_NAME,
  DEFAULT_AUTHOR_EMAIL,
  DEFAULT_LICENSE,
  DEFAULT_EXAMPLE_NAME,
  DEFAULT_EXAMPLE_REACT_NATIVE_TEMPLATE,
} = require('./constants');

const renderTemplateIfValid = (fs, root, template, templateArgs) => {
  // avoid throwing an exception in case there is no valid template.name member
  const name = !!template.name && template.name(templateArgs);
  if (!name) return Promise.resolve();

  const filename = path.join(root, name);
  const [baseDir] = filename.split(path.basename(filename));

  return fs.ensureDir(baseDir).then(() =>
    fs.outputFile(filename, template.content(templateArgs))
  );
};

// FUTURE TBD make this asynchronous and possibly more functional:
const npmAddScriptSync = (packageJsonPath, script, fs) => {
  try {
    var packageJson = jsonfile.readFileSync(packageJsonPath, { fs });
    if (!packageJson.scripts) packageJson.scripts = {};
    packageJson.scripts[script.key] = script.value;
    jsonfile.writeFileSync(packageJsonPath, packageJson, { fs, spaces: 2 });
  } catch (e) {
    if (/ENOENT.*package.json/.test(e.message)) {
      throw new Error(`The package.json at path: ${packageJsonPath} does not exist.`);
    } else {
      throw e;
    }
  }
};

const generateWithNormalizedOptions = ({
  name,
  prefix, // (only needed for logging purposes in this function)
  moduleName,
  objectClassName,
  modulePrefix,
  packageIdentifier = DEFAULT_PACKAGE_IDENTIFIER,
  // namespace - library API member removed since Windows platform
  // is now removed (may be added back someday in the future)
  // namespace,
  platforms = DEFAULT_PLATFORMS,
  tvosEnabled = false,
  githubAccount = DEFAULT_GITHUB_ACCOUNT,
  authorName = DEFAULT_AUTHOR_NAME,
  authorEmail = DEFAULT_AUTHOR_EMAIL,
  license = DEFAULT_LICENSE,
  view = false,
  useAppleNetworking = false,
  generateExample = false,
  exampleName = DEFAULT_EXAMPLE_NAME,
  exampleReactNativeTemplate = DEFAULT_EXAMPLE_REACT_NATIVE_TEMPLATE,
  useTypescript = false,
  patchUnifiedExample = false,
  useSwift = false,
  useKotlin = false,
}, {
  fs = fsExtra, // (this can be mocked out for testing purposes)
  execa = execaDefault, // (this can be mocked out for testing purposes)
}) => {
  if (packageIdentifier === DEFAULT_PACKAGE_IDENTIFIER) {
    warn(`While \`{DEFAULT_PACKAGE_IDENTIFIER}\` is the default package
      identifier, it is recommended to customize the package identifier.`);
  }

  // Note that the some of these console log messages are logged as
  // info instead of verbose since they are needed to help
  // make sense of the console output from the third-party tools.

  info(
    `CREATE new React Native module with the following options:

                     name: ${name}
    root moduleName
      (full package name): ${moduleName}
                  is view: ${view}
 object class name prefix: ${prefix}
        object class name: ${objectClassName}
     library modulePrefix: ${modulePrefix}
Android packageIdentifier: ${packageIdentifier}
                platforms: ${platforms}
        Apple tvosEnabled: ${tvosEnabled}
               authorName: ${authorName}
              authorEmail: ${authorEmail}
     author githubAccount: ${githubAccount}
                  license: ${license}
       useAppleNetworking: ${useAppleNetworking}
            useTypescript: ${useTypescript}
                 useSwift: ${useSwift}
                useKotlin: ${useKotlin}
` + (generateExample
      ? `
           generateExample: ${generateExample}
               exampleName: ${exampleName}
exampleReactNativeTemplate: ${exampleReactNativeTemplate}
       patchUnifiedExample: ${patchUnifiedExample}
` : ``));

  // QUICK LOCAL INJECTION overwite of existing execSync / commandSync call from
  // mockable execa object for now (at least):
  const commandSync = execa.commandSync;

  if (generateExample) {
    const reactNativeVersionCommand = 'npx react-native --version';
    const yarnVersionCommand = 'yarn --version';

    const checkCliOptions = { stdio: 'inherit' };
    const errorRemedyMessage = 'yarn CLI tools are needed to generate example project';

    try {
      info('CREATE: Check for valid react-native-cli tool version, as needed to generate the example project');
      commandSync(reactNativeVersionCommand, checkCliOptions);
      info(`${reactNativeVersionCommand} ok`);
    } catch (e) {
      throw new Error(
        `${reactNativeVersionCommand} failed; ${errorRemedyMessage}`);
    }

    try {
      info('CREATE: Check for valid Yarn CLI tool version, as needed to generate the example project');
      commandSync(yarnVersionCommand, checkCliOptions);
      info(`${yarnVersionCommand} ok`);
    } catch (e) {
      throw new Error(
        `${yarnVersionCommand} failed; ${errorRemedyMessage}`);
    }

    // NOTE: While the pod tool is also required for example on iOS,
    // react-native CLI will help the user install this tool if needed.
  }

  info('CREATE: Generating the React Native library module');

  const generateLibraryModule = () => {
    return fs.ensureDir(moduleName).then(() => {
      return Promise.all(templates.filter((template) => {
        if (template.platform) {
          return (platforms.indexOf(template.platform) >= 0);
        }

        return true;
      }).map((template) => {
        const templateArgs = {
          moduleName,
          objectClassName,
          packageIdentifier,
          // namespace - library API member removed since Windows platform
          // is now removed (may be added back someday in the future)
          // namespace,
          platforms,
          tvosEnabled,
          githubAccount,
          authorName,
          authorEmail,
          license,
          view,
          exampleName,
          useAppleNetworking,
          useTypescript,
          patchUnifiedExample,
          useSwift,
          useKotlin,
        };

        return renderTemplateIfValid(fs, moduleName, template, templateArgs);
      }));
    });
  };

  // This separate promise makes it easier to generate
  // multiple test or sample apps in the future.
  const generateExampleApp = () => {
    const exampleReactNativeInitCommand =
        `npx react-native init ${exampleName} --template ${exampleReactNativeTemplate}`;

    const execOptions = { cwd: `./${moduleName}`, stdio: 'inherit' };

    // (with the work done in a promise chain)
    return Promise.resolve()
      .then(() => {
        info(`CREATE example app with the following command: ${exampleReactNativeInitCommand}`);
        // We use synchronous execSync / commandSync call here
        // which is able to output its stdout to stdout in this process.
        // Note that any exception would be properly handled since this
        // call is executed within a Promise.resolve().then() callback.
        commandSync(exampleReactNativeInitCommand, execOptions);
      })
      .then(() => {
        info(`PATCH example related templates`);

        // Render the example template
        const templateArgs = {
          moduleName,
          objectClassName,
          packageIdentifier,
          view,
          useAppleNetworking,
          exampleName,
          useTypescript,
          patchUnifiedExample,
          useSwift,
          useKotlin,
        };

        return Promise.all(
          exampleTemplates.map((template) => {
            return renderTemplateIfValid(fs, moduleName, template, templateArgs);
          })
        );
      });
  };

  return generateLibraryModule().then(() => {
    return (generateExample
      ? generateExampleApp()
      : Promise.resolve()
    );
  });
};

// lib function that accepts options argument and optionally
// a hidden ioImports object argument which is
// mockable, unstable, and not documented
module.exports = function lib (options) {
  // get hidden ioImports object argument if available
  const ioImports = (arguments.length > 1)
    ? arguments[1]
    : {};

  return generateWithNormalizedOptions(
    normalizedOptions(options),
    ioImports);
};
