import * as cppPlugin from 'snyk-cpp-plugin';
import { Options } from './types';
import { TestCommandResult } from '../cli/commands/types';
import * as config from './config';
import { isCI } from './is-ci';
import * as snyk from './';
import request = require('./request');

interface Artifact {
  type: string;
  data: any;
  meta?: { [key: string]: any };
}

interface ScanResult {
  type: string;
  artifacts: Artifact[];
  meta: {
    [key: string]: any;
  };
}

export interface EcosystemPlugin {
  scan: (options: Options) => Promise<ScanResult[]>;
  display: (scanResults: ScanResult[]) => Promise<string>;
}

export type Ecosystem = 'cpp';

const EcosystemPlugins: {
  readonly [ecosystem in Ecosystem]: EcosystemPlugin;
} = {
  cpp: cppPlugin,
};

export function getPlugin(ecosystem: Ecosystem): EcosystemPlugin {
  return EcosystemPlugins[ecosystem];
}

export function getEcosystem(options: Options): Ecosystem | null {
  if (options.source) {
    return 'cpp';
  }
  return null;
}

export async function testEcosystem(
  ecosystem: Ecosystem,
  paths: string[],
  options: Options,
): Promise<TestCommandResult> {
  const plugin = getPlugin(ecosystem);
  let allScanResults: ScanResult[] = [];
  for (const path of paths) {
    options.path = path;
    const scanResults = await plugin.scan(options);
    allScanResults = allScanResults.concat(scanResults);
  }

  const testResults = await testDependencies(allScanResults);

  const stringifiedData = JSON.stringify(testResults, null, 2);
  if (options.json) {
    return TestCommandResult.createJsonTestCommandResult(stringifiedData);
  }
  const readableResult = await plugin.display(allScanResults, testResults);
  return TestCommandResult.createHumanReadableTestCommandResult(
    readableResult,
    stringifiedData,
  );
}

export async function testDependencies(
  scanResults: ScanResult[],
): Promise<any> {
  const requests: any = [];

  for (const scanResult of scanResults) {
    const payload = {
      method: 'POST',
      url: `${config.API}/test-dependencies`,
      json: true,
      headers: {
        'x-is-ci': isCI(),
        authorization: 'token ' + snyk.api,
      },
      body: {
        type: 'cpp',
        artifacts: scanResult.artifacts,
        meta: {},
      },
    };

    requests.push(makeRequest(payload));
  }

  return await Promise.all(requests);
}

async function makeRequest(payload: any) {
  return new Promise((resolve, reject) => {
    request(payload, (error, res, body) => {
      if (error) {
        return reject(error);
      }
      resolve(body);
    });
  });
}
