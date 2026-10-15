// @vitest-environment node
import { it, expect } from 'vitest'
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
it('renames product/package/image/storage identity while preserving API configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proto-rename-'))
  try {
    for (const file of [
      'package.json',
      'project.config.json',
      'index.html',
      'README.md',
      '.env.example',
    ])
      copyFileSync(file, join(dir, file))
    const initialProject = JSON.parse(readFileSync(join(dir, 'project.config.json'), 'utf8')) as {
      imageName: string
    }
    const composeTemplate = [
      'services:',
      '  web:',
      '    image: ' + JSON.stringify('${FRONTEND_IMAGE:-' + initialProject.imageName + '}'),
      '    restart: unless-stopped',
      '    ports:',
      '      - "10008:80"',
      '    environment:',
      '      API_BASE_PATH: "/api"',
      '',
    ].join('\n')
    writeFileSync(join(dir, 'compose.yaml'), composeTemplate)
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'scripts/rename-project.mjs'), 'new-product', 'New title'],
      { cwd: dir },
    )
    const project = JSON.parse(readFileSync(join(dir, 'project.config.json'), 'utf8')) as {
      storageNamespace: string
      displayName: string
      legacyNamespaces: string[]
      imageName: string
    }
    expect(project.storageNamespace).toBe('new-product')
    expect(project.legacyNamespaces).toContain('proto-bridge-ui')
    expect(project.displayName).toBe('New title')
    expect(project.imageName).toBe('new-product')
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name).toBe('new-product')
    expect(readFileSync(join(dir, 'compose.yaml'), 'utf8')).toContain('FRONTEND_IMAGE:-new-product')
    expect(readFileSync(join(dir, 'compose.yaml'), 'utf8')).toBe(
      composeTemplate.replace(
        'FRONTEND_IMAGE:-' + initialProject.imageName,
        'FRONTEND_IMAGE:-new-product',
      ),
    )
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('<title>New title</title>')
    expect(readFileSync(join(dir, '.env.example'), 'utf8')).toBe(
      readFileSync('.env.example', 'utf8'),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
