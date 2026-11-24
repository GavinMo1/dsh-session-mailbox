// Where the library lives. Two different resolutions on purpose:
//   cliRoot()    honours UM_HOME so every test and recipe can run against a
//                throwaway directory;
//   pluginRoot() never reads UM_HOME, so an environment variable can never
//                silently point the running agent at a temporary library.
import os from 'node:os'
import path from 'node:path'

export function libraryRoot(home) {
  return path.join(home, '.agents', 'user-model')
}

export function pluginRoot() {
  return libraryRoot(os.homedir())
}

export function cliRoot(env = process.env) {
  const override = env.UM_HOME
  if (typeof override === 'string' && override.trim() !== '') return path.resolve(override)
  return pluginRoot()
}
