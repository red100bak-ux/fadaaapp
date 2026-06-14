const { withProjectBuildGradle } = require('@expo/config-plugins');

// Forces all Kotlin dependencies to 1.9.24 so Compose Compiler 1.5.14 stays compatible.
// Without this, transitive deps pull in Kotlin 1.9.25 which breaks expo-modules-core.
module.exports = function withKotlinFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('resolutionStrategy.eachDependency')) {
      return config;
    }
    config.modResults.contents += `
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { DependencyResolveDetails details ->
            if (details.requested.group == 'org.jetbrains.kotlin') {
                details.useVersion '1.9.24'
            }
        }
    }
}
`;
    return config;
  });
};
