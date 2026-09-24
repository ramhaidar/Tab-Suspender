// Cross-platform replacement for `rm -rf ./build_dir/*` in the build scripts.
// Ensures build_dir exists and is empty, preserving the original cleanup behavior.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const buildDir = join(process.cwd(), 'build_dir');

mkdirSync(buildDir, { recursive: true });

for (const entry of readdirSync(buildDir)) {
	rmSync(join(buildDir, entry), { recursive: true, force: true });
}
