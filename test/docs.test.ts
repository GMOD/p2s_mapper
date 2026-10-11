import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'
import { expect, test } from 'vitest'

import { renderApiDoc } from '../scripts/api-doc.ts'

const root = path.join(import.meta.dirname, '..')
const indexFile = path.join(root, 'src/index.ts')
const docs = ['README.md', 'docs/api.md', 'docs/coordinates.md', 'docs/faq.md']

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  types: [],
  strict: true,
  noUncheckedIndexedAccess: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  paths: { p2s_mapper: [indexFile] },
}

function read(file: string) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function codeBlocks(markdown: string) {
  return [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map(m => ({
    lang: m[1],
    code: m[2]!,
  }))
}

function exportedNames() {
  const program = ts.createProgram([indexFile], compilerOptions)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(indexFile)!)!
  return checker.getExportsOfModule(module).map(s => s.name)
}

test('api.md has a signature for every export', () => {
  const listed = new Set(
    [...read('docs/api.md').matchAll(/<!-- GENERATED: ([^>]*?) -->/g)].flatMap(
      m => m[1]!.split(/\s+/),
    ),
  )
  expect(exportedNames().filter(name => !listed.has(name))).toEqual([])
})

test('api.md signature blocks match the source; pnpm docs:api rewrites them', async () => {
  const current = read('docs/api.md')
  expect(await renderApiDoc(current)).toBe(current)
}, 60_000)

test('every example that imports the package typechecks', () => {
  const examples = new Map<string, string>()
  for (const doc of docs) {
    codeBlocks(read(doc))
      .filter(b => b.lang === 'ts' && b.code.includes("from 'p2s_mapper'"))
      .forEach((b, i) => {
        examples.set(path.join(root, `${doc}.example-${i + 1}.ts`), b.code)
      })
  }
  expect(examples.size).toBeGreaterThan(0)

  const base = ts.createCompilerHost(compilerOptions)
  const host: ts.CompilerHost = {
    ...base,
    fileExists: f => examples.has(f) || base.fileExists(f),
    readFile: f => examples.get(f) ?? base.readFile(f),
    getSourceFile: (f, lang, ...rest) => {
      const text = examples.get(f)
      return text === undefined
        ? base.getSourceFile(f, lang, ...rest)
        : ts.createSourceFile(f, text, lang)
    },
  }
  const program = ts.createProgram([...examples.keys()], compilerOptions, host)
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter(d => d.file && examples.has(d.file.fileName))
    .map(d => {
      const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0)
      const where = `${path.relative(root, d.file!.fileName)}:${line + 1}`
      return `${where} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    })
  expect(errors).toEqual([])
}, 60_000)
