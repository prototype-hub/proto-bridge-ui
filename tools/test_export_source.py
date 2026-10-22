"""Behavioral checks for the standalone source export boundary."""

import contextlib
import io
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import struct
import unittest
import zlib

exporter = runpy.run_path(str(Path(__file__).with_name('export-source.py')))


class SourceExportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='source-export-test-')
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'source'
        (self.root / 'src').mkdir(parents=True)
        (self.root / 'src/a.py').write_text('print("public")\n')
        (self.root / 'README.md').write_text('[source](src/a.py)\n')
        self.rules = {'schemaVersion': 1, 'project': 'fixture', 'files': ['README.md'],
                      'directories': ['src'], 'sourceExtensions': ['.py'], 'exclude': []}

    def tearDown(self):
        self.temp.cleanup()

    def collect(self):
        return exporter['collect'](self.root, self.rules)

    def png(self):
        def chunk(kind, payload):
            return (struct.pack('>I', len(payload)) + kind + payload
                    + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))
        return (b'\x89PNG\r\n\x1a\n'
                + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(b'\0\xff\0\0\xff'))
                + chunk(b'IEND', b''))

    def reviewed_png(self, content):
        path = 'src/brand.png'
        (self.root / path).write_bytes(content)
        self.rules['binaryAssets'] = [{'path': path, 'sha256': hashlib.sha256(content).hexdigest(),
                                       'width': 1, 'height': 1}]

    def test_exports_only_reviewed_files_with_hashes(self):
        (self.root / 'src/.env').write_text('SECRET=local-only\n')
        (self.root / 'src/data').mkdir()
        (self.root / 'src/data/private.txt').write_text('local-only\n')
        output = self.base / 'result'
        with contextlib.redirect_stdout(io.StringIO()):
            exporter['export'](self.root, output, self.rules)
        manifest = json.loads((output / 'SOURCE_MANIFEST.json').read_text())
        self.assertEqual(['README.md', 'src/a.py'], [row['path'] for row in manifest['files']])
        self.assertTrue(all(len(row['sha256']) == 64 for row in manifest['files']))
        self.assertFalse((output / 'src/.env').exists())

    def test_preserves_business_logs_and_config_but_excludes_runtime_logs(self):
        for relative in ['src/logs/query.py', 'src/config/settings.py', 'logs/runtime.py']:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('print("fixture")\n')
        (self.root / 'src/logs/.env').write_text('SECRET=local-only\n')
        self.rules['directories'].append('logs')
        output = self.base / 'result'
        with contextlib.redirect_stdout(io.StringIO()):
            exporter['export'](self.root, output, self.rules)
        self.assertTrue((output / 'src/logs/query.py').is_file())
        self.assertTrue((output / 'src/config/settings.py').is_file())
        self.assertFalse((output / 'logs').exists())
        self.assertFalse((output / 'src/logs/.env').exists())

    def test_repository_export_preserves_build_tools_and_legal_materials(self):
        repository = Path(__file__).resolve().parent.parent
        rules = json.loads((repository / 'open-source-export.json').read_text())
        output = self.base / 'repository-export'
        with contextlib.redirect_stdout(io.StringIO()):
            exporter['export'](repository, output, rules)
        for relative in ['tools/third-party-notices.mjs', 'tools/lib/dependencies.mjs',
                         'tools/run-e2e.mjs', 'tests/release/release-notices.test.mjs']:
            self.assertEqual((repository / relative).read_bytes(), (output / relative).read_bytes())
        for material in (repository / 'third-party').iterdir():
            self.assertEqual(material.read_bytes(), (output / 'third-party' / material.name).read_bytes())
        self.assertEqual(2, len(rules['binaryAssets']))
        for record in rules['binaryAssets']:
            path = record['path']
            self.assertEqual((repository / path).read_bytes(), (output / path).read_bytes())
            self.assertEqual(record['sha256'], hashlib.sha256((output / path).read_bytes()).hexdigest())

    def test_exports_only_exact_reviewed_png_bytes(self):
        content = self.png()
        self.reviewed_png(content)
        output = self.base / 'png-export'
        with contextlib.redirect_stdout(io.StringIO()):
            exporter['export'](self.root, output, self.rules)
        self.assertEqual(content, (output / 'src/brand.png').read_bytes())

    def test_rejects_forged_reviewed_png_even_with_matching_hash(self):
        self.reviewed_png(b'not-a-png')
        with self.assertRaisesRegex(ValueError, 'PNG signature'):
            self.collect()

    def test_rejects_png_dimensions_and_changed_reviewed_bytes(self):
        self.reviewed_png(self.png())
        self.rules['binaryAssets'][0]['width'] = 2
        with self.assertRaisesRegex(ValueError, 'PNG dimensions'):
            self.collect()
        self.rules['binaryAssets'][0]['width'] = 1
        self.rules['binaryAssets'][0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'PNG bytes changed'):
            self.collect()

    def test_rejects_valid_but_unreviewed_png(self):
        (self.root / 'src/unreviewed.png').write_bytes(self.png())
        with self.assertRaisesRegex(ValueError, 'Unreviewed file type'):
            self.collect()

    def test_rejects_internal_output(self):
        with self.assertRaises(ValueError):
            exporter['export'](self.root, self.root / 'out', self.rules)

    def test_rejects_source_ancestor_output(self):
        with self.assertRaises(ValueError):
            exporter['export'](self.root, self.base, self.rules)

    def test_refuses_overwrite(self):
        output = self.base / 'result'
        output.mkdir()
        with self.assertRaises(ValueError):
            exporter['export'](self.root, output, self.rules)

    def test_rejects_internal_and_external_symlinks(self):
        link = self.root / 'src/link.py'
        for target in [self.root / 'src/a.py', self.base / 'outside']:
            link.symlink_to(target)
            with self.assertRaises(ValueError):
                self.collect()
            link.unlink()

    def test_rejects_private_key_without_echoing_value(self):
        marker = '-----BEGIN ' + 'PRIVATE KEY-----'
        (self.root / 'src/leak.py').write_text(marker)
        with self.assertRaises(ValueError) as failure:
            exporter['scan'](self.root, self.collect())
        self.assertNotIn(marker, str(failure.exception))

    def test_rejects_sensitive_literal(self):
        (self.root / 'src/leak.py').write_text('service_secret = "' + 'A' * 32 + '"\n')
        with self.assertRaises(ValueError):
            exporter['scan'](self.root, self.collect())

    def test_fixture_placeholder_does_not_hide_later_sensitive_value(self):
        tests = self.root / 'tests'
        tests.mkdir()
        fixture = tests / 'fixture.py'
        placeholder = 'api_key = "fixture-existing-placeholder-value"\n'
        fixture.write_text(placeholder)
        exporter['scan'](self.root, [Path('tests/fixture.py')])
        fixture.write_text(placeholder + 'api_key = "' + 'A' * 32 + '"\n')
        with self.assertRaises(ValueError):
            exporter['scan'](self.root, [Path('tests/fixture.py')])
        (self.root / 'src/leak.py').write_text(placeholder)
        with self.assertRaises(ValueError):
            exporter['scan'](self.root, [Path('src/leak.py')])

    def test_rejects_unreviewed_file_type(self):
        (self.root / 'src/unreviewed.png').write_bytes(b'not-reviewed')
        with self.assertRaises(ValueError):
            self.collect()

    def test_rejects_readme_link_not_selected(self):
        (self.root / 'README.md').write_text('[private](not-selected.md)\n')
        with self.assertRaises(ValueError):
            exporter['validate_markdown_links'](self.root, self.collect())

    def test_validates_nested_public_document_links(self):
        (self.root / 'src/guide.md').write_text('[private](../not-selected.md)\n')
        self.rules['sourceExtensions'].append('.md')
        with self.assertRaises(ValueError):
            exporter['validate_markdown_links'](self.root, self.collect())

    def test_rejects_allowlist_traversal(self):
        with self.assertRaises(ValueError):
            exporter['safe_relative']('../outside')


if __name__ == '__main__':
    unittest.main()
