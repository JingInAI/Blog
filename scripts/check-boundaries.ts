import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';
import { VISITOR_KEYS, isNode, isStringLiteral, isImportDeclaration, isExportNamedDeclaration, isExportAllDeclaration, isImportExpression, isTSImportType, isTSImportEqualsDeclaration, isTSExternalModuleReference, isCallExpression, isIdentifier, isReferenced } from '@babel/types';
import type { Node } from '@babel/types';

const shared: Record<string, readonly string[]> = {
  contracts: [], 'content-source': ['contracts'], 'render-core': ['contracts', 'theme-contracts'], 'theme-contracts': ['contracts']
};
const extensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']);
const browserGlobals = new Set(['window', 'document', 'localStorage', 'HTMLElement']);
const errors: string[] = [];
function frameworkOwner(specifier: string): string | undefined {
  if (specifier === 'vue' || specifier.startsWith('vue/') || specifier.startsWith('@vue/')) return 'renderer-vue';
  if (specifier === 'react' || specifier.startsWith('react/') || specifier === 'react-dom' || specifier.startsWith('react-dom/')) return 'renderer-react';
  return undefined;
}
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : extensions.has(path.extname(entry.name)) ? [path.join(dir, entry.name)] : []))).flat();
}
function checkSpecifier(name: string, allowed: readonly string[], sourceRoot: string, file: string, specifier: string): void {
  if (specifier.startsWith('@blog/') && !allowed.includes(specifier.slice(6).split('/')[0])) errors.push(`${file}: forbidden dependency ${specifier}`);
  if ((specifier.startsWith('.') || path.isAbsolute(specifier)) && !path.resolve(path.dirname(file), specifier).startsWith(sourceRoot + path.sep)) errors.push(`${file}: package escape ${specifier}`);
  const owner = frameworkOwner(specifier);
  if (owner && name !== owner) errors.push(`${file}: cross-framework import ${specifier}`);
}
function checkCode(name: string, allowed: readonly string[], sourceRoot: string, file: string, code: string): void {
  const source = parse(code, { sourceType: 'unambiguous', createImportExpressions: true, plugins: ['typescript', 'jsx'] });
  const dependency = (node: Node | null | undefined): void => {
    if (isStringLiteral(node)) checkSpecifier(name, allowed, sourceRoot, file, node.value);
    else errors.push(`${file}: dependency must use a literal module specifier`);
  };
  const visit = (node: Node, parent?: Node): void => {
    if ((isImportDeclaration(node) || isExportNamedDeclaration(node) || isExportAllDeclaration(node)) && node.source) dependency(node.source);
    else if (isImportExpression(node)) dependency(node.source);
    else if (isTSImportType(node)) dependency(node.argument);
    else if (isTSImportEqualsDeclaration(node) && isTSExternalModuleReference(node.moduleReference)) dependency(node.moduleReference.expression);
    else if (isCallExpression(node) && isIdentifier(node.callee, { name: 'require' })) dependency(node.arguments[0]);
    if (Object.hasOwn(shared, name) && name !== 'contracts' && isIdentifier(node) && browserGlobals.has(node.name) && parent && isReferenced(node, parent)) errors.push(`${file}: browser global in shared core ${node.name}`);
    const record = node as unknown as Record<string, unknown>;
    for (const key of VISITOR_KEYS[node.type] ?? []) {
      const value = record[key];
      if (Array.isArray(value)) { for (const child of value) if (isNode(child)) visit(child, node); }
      else if (isNode(value)) visit(value, node);
    }
  };
  visit(source);
}
for (const entry of await readdir('packages', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const name = entry.name;
  const allowed = shared[name] ?? (/^renderer-[a-z][a-z0-9-]*$/.test(name) ? ['contracts', 'theme-contracts'] : undefined);
  if (!allowed) { errors.push(`${name}: package requires an explicit dependency policy`); continue; }
  const pkg = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependency of Object.keys(pkg[section] ?? {})) {
      if (dependency.startsWith('@blog/') && !allowed.includes(dependency.slice(6))) errors.push(`${name}: forbidden dependency ${dependency}`);
      const owner = frameworkOwner(dependency);
      if (owner && name !== owner) errors.push(`${name}: forbidden framework ${dependency}`);
    }
  }
  const sourceRoot = path.resolve(`packages/${name}/src`);
  for (const file of await walk(sourceRoot)) {
    const source = await readFile(file, 'utf8');
    if (['.vue', '.svelte'].includes(path.extname(file))) {
      for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)) checkCode(name, allowed, sourceRoot, file, match[1]);
    } else checkCode(name, allowed, sourceRoot, file, source);
  }
}
if (errors.length) throw new Error([...new Set(errors)].join('\n'));
console.log('Module and framework boundaries passed.');
