import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from '@blog/contracts';

async function physicalPath(file: string): Promise<string> {
  let current = path.resolve(file); const missing: string[] = [];
  for (;;) {
    try { return path.join(await realpath(current), ...missing); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(current) === current) throw error;
      missing.unshift(path.basename(current)); current = path.dirname(current);
    }
  }
}
function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
export async function assertSeparatePaths(source: string, output: string): Promise<void> {
  const [inputPath, outputPath] = await Promise.all([physicalPath(source), physicalPath(output)]);
  if (contains(inputPath, outputPath) || contains(outputPath, inputPath)) throw new ValidationError(output, 'source-output-overlap');
}
export async function assertOutputDirectory(output: string): Promise<void> {
  try { if (!(await stat(output)).isDirectory()) throw new ValidationError(output, 'invalid-output-directory'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export async function assertProjectOutput(output: string, configFile: string): Promise<void> {
  // Atomic output replacement must not remove author content or the running project.
  const inputs = ['apps', 'packages', 'scripts', 'tests', 'docs', 'content', '.git', '.github', 'node_modules', 'package.json', 'package-lock.json', 'tsconfig.json', 'blog.config.json', 'blog-architecture.json', configFile];
  await Promise.all(inputs.map(input => assertSeparatePaths(input, output)));
  await assertOutputDirectory(output);
}
