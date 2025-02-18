import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { logger } from '@lumix/core';

interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  needsUpdate: boolean;
}

const LANGCHAIN_PACKAGES = [
  'langchain',
  '@langchain/core',
  '@langchain/openai',
  '@langchain/anthropic',
  '@langchain/community'
];

async function getLatestVersion(packageName: string): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    const data = await response.json();
    return data['dist-tags'].latest;
  } catch (error) {
    logger.error('Version Check', `Failed to get latest version for ${packageName}`);
    throw error;
  }
}

async function getCurrentVersions(): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const { dependencies, devDependencies } = packageJson;

    for (const pkg of LANGCHAIN_PACKAGES) {
      if (dependencies?.[pkg]) {
        versions.set(pkg, dependencies[pkg].replace('^', ''));
      }
      if (devDependencies?.[pkg]) {
        versions.set(pkg, devDependencies[pkg].replace('^', ''));
      }
    }
  } catch (error) {
    logger.error('Version Check', 'Failed to read package.json');
    throw error;
  }

  return versions;
}

async function checkVersions(): Promise<PackageInfo[]> {
  const currentVersions = await getCurrentVersions();
  const results: PackageInfo[] = [];

  for (const pkg of LANGCHAIN_PACKAGES) {
    try {
      const currentVersion = currentVersions.get(pkg) || 'not installed';
      const latestVersion = await getLatestVersion(pkg);
      
      results.push({
        name: pkg,
        currentVersion,
        latestVersion,
        needsUpdate: currentVersion !== latestVersion && currentVersion !== 'not installed'
      });
    } catch (error) {
      logger.error('Version Check', `Error checking version for ${pkg}`);
    }
  }

  return results;
}

function printResults(results: PackageInfo[]): void {
  console.log('\nLangChain Dependencies Version Check:');
  console.log('=====================================');
  
  for (const pkg of results) {
    console.log(`\nPackage: ${pkg.name}`);
    console.log(`Current Version: ${pkg.currentVersion}`);
    console.log(`Latest Version: ${pkg.latestVersion}`);
    console.log(`Status: ${pkg.needsUpdate ? '🔴 Update needed' : '🟢 Up to date'}`);
  }

  const needsUpdate = results.filter(r => r.needsUpdate);
  if (needsUpdate.length > 0) {
    console.log('\n⚠️  Updates Available:');
    console.log('-------------------');
    needsUpdate.forEach(pkg => {
      console.log(`${pkg.name}: ${pkg.currentVersion} -> ${pkg.latestVersion}`);
    });
    console.log('\nRun "pnpm run update-deps" to update dependencies.');
  } else {
    console.log('\n✅ All LangChain dependencies are up to date!');
  }
}

async function main() {
  try {
    const results = await checkVersions();
    printResults(results);
    
    // 如果有需要更新的包，退出码设为1
    if (results.some(r => r.needsUpdate)) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 